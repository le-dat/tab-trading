import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module';
import { OrderModule } from './modules/order/order.module';
import { PriceModule } from './modules/price/price.module';
import { SettlementModule } from './modules/settlement/settlement.module';
import { SocketModule } from './modules/socket/socket.module';
import { KafkaModule } from './modules/kafka/kafka.module';
import { AdaptersModule } from './adapters/adapters.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@localhost:5434/${process.env.POSTGRES_DB}`,
      autoLoadEntities: true,
      synchronize: false,
      logging: process.env.NODE_ENV === 'development',
    }),
    AdaptersModule,
    AuthModule,
    OrderModule,
    PriceModule,
    SettlementModule,
    SocketModule,
    KafkaModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
