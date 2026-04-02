import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { Public } from '../../decorators/public.decorator';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEthereumAddress } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: '0x1234567890abcdef1234567890abcdef12345678', description: 'Ethereum wallet address' })
  @IsEthereumAddress()
  walletAddress: string;

  @ApiProperty({ required: false, example: 'did:privy:xxx', description: 'Optional Privy DID' })
  @IsString()
  privyDid?: string;
}

export class VerifyDto {
  @ApiProperty({ example: 'eyJhbGciOiJFU...', description: 'Privy token from frontend SDK' })
  @IsString()
  privyToken: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
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

  @Public()
  @Post('verify')
  @ApiOperation({ summary: 'Verify Privy token and issue app JWT' })
  @ApiResponse({ status: 201, description: 'JWT token issued' })
  @ApiResponse({ status: 401, description: 'Invalid Privy token' })
  async verify(@Body() dto: VerifyDto) {
    const { walletAddress, privyDid } = await this.authService.verifyPrivyToken(dto.privyToken);
    const user = await this.authService.findOrCreateUser(walletAddress, privyDid);
    const token = await this.authService.issueAppJwt(user.walletAddress, user.id);
    return {
      token,
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
      },
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiResponse({ status: 200, description: 'User profile data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async me(@CurrentUser() user: { walletAddress: string; userId: string }) {
    const fullUser = await this.authService.getUserByWallet(user.walletAddress);
    return {
      id: fullUser.id,
      walletAddress: fullUser.walletAddress,
      nonce: fullUser.nonce,
    };
  }
}
