import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Settlement, SettlementType } from '../../entities/settlement.entity';
import { Order, OrderStatus } from '../../entities/order.entity';
import { OrderService } from '../order/order.service';
import { TapOrderAdapter } from '../../adapters/tap-order.adapter';
import { PriceService } from '../price/price.service';
import { SocketService } from '../socket/socket.service';
import { KafkaService } from '../kafka/kafka.service';

@Injectable()
export class SettlementService implements OnModuleInit, OnModuleDestroy {
  private settlementInterval: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(Settlement)
    private settlementRepository: Repository<Settlement>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    private orderService: OrderService,
    @Inject(TapOrderAdapter)
    private tapOrderAdapter: TapOrderAdapter,
    private priceService: PriceService,
    private socketService: SocketService,
    private kafkaService: KafkaService,
  ) {}

  onModuleInit() {
    // Settlement polling will be started by the worker process
  }

  onModuleDestroy() {
    this.stopSettlementLoop();
  }

  startSettlementLoop(intervalMs = 100) {
    this.settlementInterval = setInterval(async () => {
      try {
        const openOrders = await this.orderRepository.find({
          where: { status: OrderStatus.OPEN },
        });

        for (const order of openOrders) {
          const now = BigInt(Date.now());
          const expiry = BigInt(order.expiryTimestamp);

          if (now >= expiry) {
            try {
              await this.settleOrderOnChain(order.id);
            } catch (err) {
              console.error(`Settlement failed for order ${order.id}:`, err);
            }
          }
        }
      } catch (err) {
        console.error('Settlement loop error:', err);
      }
    }, intervalMs);
  }

  stopSettlementLoop() {
    if (this.settlementInterval) {
      clearInterval(this.settlementInterval);
      this.settlementInterval = null;
    }
  }

  async settleOrderOnChain(orderId: string): Promise<void> {
    // Load full order with userId
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      return;
    }

    // Check if already settled on-chain
    try {
      const isSettled = await this.tapOrderAdapter.isSettled(BigInt(orderId));
      if (isSettled) {
        return; // Already settled, skip
      }
    } catch {
      // Adapter not initialized or RPC error — skip
      return;
    }

    // Check price freshness before settling
    try {
      const isStale = await this.priceService.isPriceStale(order.asset);
      if (isStale) {
        console.warn(`Settlement deferred for order ${orderId}: price for ${order.asset} is stale`);
        return; // Will retry on next poll
      }
    } catch {
      // No price data yet — skip this cycle
      return;
    }

    // Call settleOrder on contract
    const result = await this.tapOrderAdapter.settleOrder(BigInt(orderId));

    // Update DB via OrderService
    await this.orderService.settleOrder(
      orderId,
      result.payoutWei.toString(),
      this.tapOrderAdapter.getSignerAddress(),
    );

    // Emit socket events (socket uses wallet address)
    if (result.isWon) {
      this.socketService.emitOrderWon(order.userAddress, orderId, result.payoutWei.toString());
    } else {
      this.socketService.emitOrderLost(order.userAddress, orderId);
    }

    // Publish settlement event to Kafka
    await this.kafkaService.emit('settlement', {
      orderId,
      userId: order.userId,
      asset: order.asset,
      isWon: result.isWon,
      payoutWei: result.payoutWei.toString(),
      txHash: result.txHash,
      timestamp: Date.now(),
    });

    // Create settlement record (userId is the FK to users table)
    await this.createSettlement(
      orderId,
      order.userId,
      result.isWon ? SettlementType.WIN : SettlementType.LOSE,
      result.payoutWei.toString(),
      result.txHash,
    );
  }

  async createSettlement(
    orderId: string,
    userId: string,
    type: SettlementType,
    payoutWei: string | null,
    txHash: string | null,
    blockNumber: string | null = null,
  ): Promise<Settlement> {
    const settlement = this.settlementRepository.create({
      orderId,
      userId,
      type,
      payoutWei,
      settlementTxHash: txHash,
      blockNumber,
    });

    return this.settlementRepository.save(settlement);
  }

  async findByOrder(orderId: string): Promise<Settlement[]> {
    return this.settlementRepository.find({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
  }
}
