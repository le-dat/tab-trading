import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ethers } from 'ethers';
import { SocketService } from '../socket/socket.service';
import { KafkaService } from '../kafka/kafka.service';

export interface CachedPrice {
  value: string;
  updatedAt: number;
}

interface FeedConfig {
  asset: string;
  address: string;
}

@Injectable()
export class PriceService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis;
  private provider: ethers.JsonRpcProvider;
  private ingestionInterval: NodeJS.Timeout | null = null;
  private readonly STALE_THRESHOLD_MS = 60_000; // 60 seconds

  constructor(
    private configService: ConfigService,
    private socketService: SocketService,
    private kafkaService: KafkaService,
  ) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      throw new Error('REDIS_URL is not configured');
    }
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
    });

    const rpcUrl = this.configService.get<string>('RPC');
    if (rpcUrl) {
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
    }

    // Auto-start ingestion if RPC is configured
    if (rpcUrl) {
      this.startPriceIngestion();
    }
  }

  async onModuleDestroy() {
    this.stopPriceIngestion();
    await this.redis.quit();
  }

  startPriceIngestion(intervalMs = 15_000) {
    if (this.ingestionInterval) return;

    const feeds = this.getFeedConfigs();

    this.ingestionInterval = setInterval(async () => {
      for (const feed of feeds) {
        try {
          await this.fetchAndUpdatePrice(feed);
        } catch (err) {
          console.error(`Price ingestion failed for ${feed.asset}:`, err);
        }
      }
    }, intervalMs);

    console.log(`Price ingestion started for ${feeds.length} feeds`);
  }

  stopPriceIngestion() {
    if (this.ingestionInterval) {
      clearInterval(this.ingestionInterval);
      this.ingestionInterval = null;
    }
  }

  private getFeedConfigs(): FeedConfig[] {
    const configs: FeedConfig[] = [];

    const btcFeed = this.configService.get<string>('FEED_BTC_USD');
    if (btcFeed) configs.push({ asset: 'BTC_USD', address: btcFeed });

    const ethFeed = this.configService.get<string>('FEED_ETH_USD');
    if (ethFeed) configs.push({ asset: 'ETH_USD', address: ethFeed });

    return configs;
  }

  private async fetchAndUpdatePrice(feed: FeedConfig): Promise<void> {
    const abi = ['function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)'];
    const contract = new ethers.Contract(feed.address, abi, this.provider);

    const [, answer, , updatedAt] = await contract.latestRoundData();

    const price = answer.toString();
    const updatedAtMs = Number(updatedAt) * 1000;

    // Skip if Chainlink hasn't updated recently (stale feed)
    if (Date.now() - updatedAtMs > 120_000) {
      console.warn(`Chainlink feed ${feed.asset} is stale (updatedAt: ${updatedAtMs})`);
      return;
    }

    // Write to Redis
    await this.setPrice(feed.asset, price);

    // Push via Socket
    this.socketService.emitPrice(feed.asset, price);

    // Publish to Kafka
    await this.kafkaService.emit('price', {
      asset: feed.asset,
      value: price,
      updatedAt: updatedAtMs,
      feedAddress: feed.address,
      timestamp: Date.now(),
    });
  }

  async setPrice(asset: string, value: string): Promise<void> {
    const cached: CachedPrice = {
      value,
      updatedAt: Date.now(),
    };
    await this.redis.set(`price:${asset}`, JSON.stringify(cached));
  }

  async getPrice(asset: string): Promise<CachedPrice> {
    const raw = await this.redis.get(`price:${asset}`);
    if (!raw) {
      throw new Error(`No price found for ${asset}`);
    }

    const cached: CachedPrice = JSON.parse(raw);

    if (Date.now() - cached.updatedAt > this.STALE_THRESHOLD_MS) {
      throw new Error(`Stale price for ${asset}`);
    }

    return cached;
  }

  async isPriceStale(asset: string): Promise<boolean> {
    try {
      const cached = await this.getPrice(asset);
      return Date.now() - cached.updatedAt > this.STALE_THRESHOLD_MS;
    } catch {
      return true;
    }
  }
}
