import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum OrderStatus {
  OPEN = 'open',
  WON = 'won',
  LOST = 'lost',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_address', type: 'varchar', length: 42 })
  @Index()
  userAddress: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'order_id_on_contract', type: 'bigint' })
  @Index()
  orderIdOnContract: string;

  @Column({ name: 'asset', type: 'varchar', length: 20 })
  asset: string;

  @Column({ name: 'target_price', type: 'bigint' })
  targetPrice: string;

  @Column({ name: 'is_above', type: 'boolean' })
  isAbove: boolean;

  @Column({ name: 'duration', type: 'int' })
  duration: number;

  @Column({ name: 'multiplier_bps', type: 'int' })
  multiplierBps: number;

  @Column({ name: 'stake_wei', type: 'numeric', precision: 78 })
  stakeWei: string;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.OPEN,
  })
  @Index()
  status: OrderStatus;

  @Column({ name: 'expiry_timestamp', type: 'bigint' })
  expiryTimestamp: string;

  @Column({ name: 'settled_at', type: 'timestamp', nullable: true })
  settledAt: Date | null;

  @Column({ name: 'settled_by', type: 'varchar', length: 42, nullable: true })
  settledBy: string | null;

  @Column({ name: 'payout_wei', type: 'numeric', precision: 78, nullable: true })
  payoutWei: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.orders)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
