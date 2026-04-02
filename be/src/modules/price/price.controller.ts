import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { PriceService } from './price.service';
import { Public } from '../../decorators/public.decorator';

@ApiTags('prices')
@Controller('prices')
export class PriceController {
  constructor(private priceService: PriceService) {}

  @Public()
  @Get(':asset')
  @ApiOperation({ summary: 'Get current price for an asset' })
  @ApiParam({ name: 'asset', description: 'Asset symbol (e.g., BTC_USD, ETH_USD)' })
  @ApiResponse({ status: 200, description: 'Price data with freshness indicator' })
  @ApiResponse({ status: 404, description: 'Price not found for asset' })
  async getPrice(@Param('asset') asset: string) {
    const cached = await this.priceService.getPrice(asset);
    return {
      asset,
      value: cached.value,
      updatedAt: cached.updatedAt,
      isStale: await this.priceService.isPriceStale(asset),
    };
  }
}
