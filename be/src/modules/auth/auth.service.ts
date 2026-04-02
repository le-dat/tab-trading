import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from '../../entities/user.entity';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async findOrCreateUser(walletAddress: string, privyDid?: string): Promise<User> {
    let user = await this.userRepository.findOne({ where: { walletAddress } });

    if (!user) {
      user = this.userRepository.create({
        walletAddress,
        privyDid: privyDid || null,
        nonce: 0,
        isBlocked: false,
      });
      user = await this.userRepository.save(user);
    }

    if (user.isBlocked) {
      throw new ForbiddenException('User is blocked');
    }

    return user;
  }

  async verifyPrivyToken(privyToken: string): Promise<{ walletAddress: string; privyDid: string }> {
    // TODO: Verify Privy token with Privy API endpoint https://auth.privy.io/api/v1/wallet/verify
    // For MVP, extract wallet address from the token's payload.
    // In production, verify the JWT signature using Privy's public key or call their API.
    try {
      // Decode the JWT payload (without verification for MVP)
      const parts = privyToken.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid Privy token format');
      }
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
      const walletAddress = payload.address;
      const privyDid = payload.sub || payload.did || `did:privy:${walletAddress}`;

      if (!walletAddress) {
        throw new Error('No wallet address in Privy token');
      }

      return { walletAddress: walletAddress.toLowerCase(), privyDid };
    } catch {
      throw new ForbiddenException('Invalid Privy token');
    }
  }

  async issueAppJwt(walletAddress: string, userId: string): Promise<string> {
    const user = await this.userRepository.findOne({ where: { walletAddress } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.isBlocked) {
      throw new ForbiddenException('User is blocked');
    }

    return this.jwtService.signAsync(
      { walletAddress, sub: userId },
      { expiresIn: '7d' },
    );
  }

  async getUserByWallet(walletAddress: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { walletAddress } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  generateNonce(): string {
    return randomBytes(32).toString('hex');
  }

  async incrementNonce(userId: string): Promise<void> {
    await this.userRepository.increment({ id: userId }, 'nonce', 1);
  }
}
