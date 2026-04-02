import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../entities/order.entity';
import { User } from '../../entities/user.entity';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { AdaptersModule } from '../../adapters/adapters.module';

@Module({
  imports: [TypeOrmModule.forFeature([Order, User]), AdaptersModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
