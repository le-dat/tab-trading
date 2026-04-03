import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Settlement, SettlementType } from '../../entities/settlement.entity';
import { Order, OrderStatus } from '../../entities/order.entity';
import { OrderService } from '../order/order.service';

@Injectable()
export class SettlementService implements OnModuleInit {
  private settlementInterval: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(Settlement)
    private settlementRepository: Repository<Settlement>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    private orderService: OrderService,
  ) {}

  onModuleInit() {
    // Settlement polling will be started by the worker process
  }

  startSettlementLoop(settleFn: (orderId: string) => Promise<void>, intervalMs = 100) {
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
              await settleFn(order.id);
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

  async createSettlement(
    orderId: string,
    userId: string,
    type: SettlementType,
    payoutWei: string | null,
    txHash: string | null,
    blockNumber: string | null,
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
