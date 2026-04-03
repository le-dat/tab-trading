import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Order } from './order.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'wallet_address', type: 'varchar', length: 42, unique: true })
  walletAddress: string;

  @Column({ name: 'privy_did', type: 'varchar', length: 255, nullable: true })
  privyDid: string | null;

  @Column({ name: 'nonce', type: 'int', default: 0 })
  nonce: number;

  @Column({ name: 'is_blocked', type: 'boolean', default: false })
  isBlocked: boolean;

  @OneToMany(() => Order, (order) => order.user)
  orders: Order[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
