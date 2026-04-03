import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Order } from './order.entity';
import { User } from './user.entity';

export enum SettlementType {
  WIN = 'win',
  LOSE = 'lose',
  REFUND = 'refund',
}

@Entity('settlements')
export class Settlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid' })
  @Index()
  orderId: string;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: SettlementType,
  })
  type: SettlementType;

  @Column({ name: 'payout_wei', type: 'numeric', precision: 78, nullable: true })
  payoutWei: string | null;

  @Column({ name: 'settlement_tx_hash', type: 'varchar', length: 66, nullable: true })
  @Index()
  settlementTxHash: string | null;

  @Column({ name: 'block_number', type: 'bigint', nullable: true })
  blockNumber: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
