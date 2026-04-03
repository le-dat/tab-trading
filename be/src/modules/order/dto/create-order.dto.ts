import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsNumber, IsPositive, Min, Max, IsOptional } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ example: 'BTC_USD', description: 'Asset symbol' })
  @IsString()
  asset: string;

  @ApiProperty({ example: '95000', description: 'Target price for the order' })
  @IsNumber()
  @IsPositive()
  targetPrice: string;

  @ApiProperty({ example: true, description: 'True if order is Above, False if Below' })
  @IsBoolean()
  isAbove: boolean;

  @ApiProperty({ example: 300, description: 'Duration in seconds' })
  @IsNumber()
  @IsPositive()
  duration: number;

  @ApiProperty({ example: 1500, description: 'Multiplier in basis points (1000 = 1.0x, 2000 = 2.0x)', minimum: 1000, maximum: 2000 })
  @IsNumber()
  @Min(1000)
  @Max(2000)
  multiplierBps: number;

  @ApiProperty({ example: '0.05', description: 'Stake amount in ETH', minimum: 0.001, maximum: 0.1 })
  @IsNumber()
  @Min(0.001)
  @Max(0.1)
  stakeWei: string;

  @ApiProperty({ example: '1709500000', description: 'Expiry timestamp' })
  @IsNumber()
  expiryTimestamp: string;

  @ApiProperty({ required: false, description: 'Optional order ID from contract' })
  @IsOptional()
  @IsString()
  orderIdOnContract?: string;
}
