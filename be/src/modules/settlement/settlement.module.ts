import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Settlement } from '../../entities/settlement.entity';
import { Order } from '../../entities/order.entity';
import { SettlementService } from './settlement.service';
import { OrderModule } from '../order/order.module';
import { AdaptersModule } from '../../adapters/adapters.module';
import { PriceModule } from '../price/price.module';
import { SocketModule } from '../socket/socket.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Settlement, Order]),
    OrderModule,
    AdaptersModule,
    PriceModule,
    SocketModule,
  ],
  providers: [SettlementService],
  exports: [SettlementService],
})
export class SettlementModule {}
