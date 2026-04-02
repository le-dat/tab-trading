import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { Public } from '../../decorators/public.decorator';

@ApiTags('orders')
@Controller('orders')
export class OrderController {
  constructor(private orderService: OrderService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new order' })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid order parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(@Body() dto: CreateOrderDto, @CurrentUser() user: { walletAddress: string; userId: string }) {
    return this.orderService.create(dto, user.walletAddress, user.userId);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get orders by user address' })
  @ApiQuery({ name: 'userAddress', required: true, description: 'User wallet address' })
  @ApiResponse({ status: 200, description: 'List of user orders' })
  async findByUser(@Query('userAddress') userAddress: string) {
    return this.orderService.findByUser(userAddress);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiResponse({ status: 200, description: 'Order details' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async findOne(@Param('id') id: string) {
    return this.orderService.findById(id);
  }
}
