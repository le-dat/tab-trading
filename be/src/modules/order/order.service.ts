import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../../entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';

const MAX_CONCURRENT_ORDERS = 5;

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) {}

  async create(dto: CreateOrderDto, userAddress: string): Promise<Order> {
    // Check concurrent order limit
    const openOrders = await this.orderRepository.count({
      where: { userAddress, status: OrderStatus.OPEN },
    });

    if (openOrders >= MAX_CONCURRENT_ORDERS) {
      throw new BadRequestException(
        `Maximum ${MAX_CONCURRENT_ORDERS} concurrent orders allowed`,
      );
    }

    const order = this.orderRepository.create({
      ...dto,
      userAddress,
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
