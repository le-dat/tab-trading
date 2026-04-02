import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parseEther } from 'ethers';
import { Order, OrderStatus } from '../../entities/order.entity';
import { User } from '../../entities/user.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { TapOrderAdapter } from '../../adapters/tap-order.adapter';

const MAX_CONCURRENT_ORDERS = 5;

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @Inject(TapOrderAdapter)
    private tapOrderAdapter: TapOrderAdapter,
  ) {}

  async create(dto: CreateOrderDto, userAddress: string, userId?: string): Promise<Order> {
    // Resolve userId from wallet address if not provided
    const user = await this.userRepository.findOne({
      where: userId ? { id: userId, walletAddress: userAddress } : { walletAddress: userAddress },
    });
    if (!user) {
      throw new NotFoundException('User not found — please register first');
    }

    // Check concurrent order limit
    const openOrders = await this.orderRepository.count({
      where: { userAddress, status: OrderStatus.OPEN },
    });

    if (openOrders >= MAX_CONCURRENT_ORDERS) {
      throw new BadRequestException(
        `Maximum ${MAX_CONCURRENT_ORDERS} concurrent orders allowed`,
      );
    }

    // Submit transaction to contract first
    const { orderId, expiry } = await this.tapOrderAdapter.createOrder({
      assetKey: dto.asset,
      targetPrice: BigInt(dto.targetPrice),
      isAbove: dto.isAbove,
      durationSecs: dto.duration,
      multiplierBps: dto.multiplierBps,
      stakeWei: parseEther(dto.stakeWei),
    });

    // Save order to DB after successful on-chain submission
    const order = this.orderRepository.create({
      asset: dto.asset,
      targetPrice: dto.targetPrice,
      isAbove: dto.isAbove,
      duration: dto.duration,
      multiplierBps: dto.multiplierBps,
      stakeWei: dto.stakeWei,
      expiryTimestamp: expiry.toString(),
      userAddress,
      userId: user.id,
      orderIdOnContract: orderId.toString(),
      status: OrderStatus.OPEN,
    });

    return this.orderRepository.save(order);
  }

  async findByUser(userAddress: string): Promise<Order[]> {
    return this.orderRepository.find({
      where: { userAddress },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<Order> {
    const order = await this.orderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async findOpenOrders(): Promise<Order[]> {
    return this.orderRepository.find({
      where: { status: OrderStatus.OPEN },
    });
  }

  async settleOrder(orderId: string, payoutWei: string, settledBy: string): Promise<Order> {
    const order = await this.findById(orderId);

    if (order.status !== OrderStatus.OPEN) {
      throw new BadRequestException('Order is not open');
    }

    const isWon = Number(payoutWei) > 0;
    order.status = isWon ? OrderStatus.WON : OrderStatus.LOST;
    order.payoutWei = payoutWei;
    order.settledBy = settledBy;
    order.settledAt = new Date();

    return this.orderRepository.save(order);
  }
}
