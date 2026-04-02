import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
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
