import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsEthereumAddress } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: '0x1234567890abcdef1234567890abcdef12345678', description: 'Ethereum wallet address' })
  @IsEthereumAddress()
  walletAddress: string;

  @ApiProperty({ required: false, example: 'did:privy:xxx', description: 'Optional Privy DID' })
  @IsOptional()
  @IsString()
  privyDid?: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register or login a user via wallet address' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Invalid wallet address' })
  async register(@Body() dto: RegisterDto) {
    const user = await this.authService.findOrCreateUser(dto.walletAddress, dto.privyDid);
    return {
      id: user.id,
      walletAddress: user.walletAddress,
      createdAt: user.createdAt,
    };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiResponse({ status: 200, description: 'User profile data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async me(@Request() req: any) {
    const user = await this.authService.getUserByWallet(req.user.walletAddress);
    return {
      id: user.id,
      walletAddress: user.walletAddress,
      nonce: user.nonce,
    };
  }
}
