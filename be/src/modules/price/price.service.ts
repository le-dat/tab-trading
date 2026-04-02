import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface CachedPrice {
  value: string;
  updatedAt: number;
}

@Injectable()
export class PriceService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis;
  private readonly STALE_THRESHOLD_MS = 60_000; // 60 seconds

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      throw new Error('REDIS_URL is not configured');
    }
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
    });
  }

  async onModuleDestroy() {
    await this.redis.quit();
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
