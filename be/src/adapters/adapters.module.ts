import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TapOrderAdapter, PayoutPoolAdapter } from './index';

@Module({
  imports: [ConfigModule],
  providers: [TapOrderAdapter, PayoutPoolAdapter],
  exports: [TapOrderAdapter, PayoutPoolAdapter],
})
export class AdaptersModule {}
