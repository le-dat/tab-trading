import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

@Injectable()
export class PayoutPoolAdapter implements OnModuleInit {
  /** @type {any} */
  private contract: any = null;
  /** @type {any} */
  private wallet: any = null;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const rpcUrl = this.configService.get<string>('RPC');
    const privateKey = this.configService.get<string>('ADMIN_PRIVATE_KEY');
    const contractAddress = this.configService.get<string>('CONTRACT_PAYOUT_POOL');

    if (!rpcUrl || !privateKey || !contractAddress || privateKey === '0x...') {
      console.warn('PayoutPoolAdapter: EVM config missing or placeholder — adapter will not be functional');
      return;
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, provider);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PayoutPool__factory } = require('../../../smc/typechain-types/factories/contracts/PayoutPool__factory');
    this.contract = PayoutPool__factory.connect(contractAddress, this.wallet);
  }

  private getContract(): any {
    if (!this.contract) {
      throw new Error('PayoutPoolAdapter not initialized — check EVM configuration');
    }
    return this.contract;
  }

  async getBalance(assetAddress: string): Promise<bigint> {
    return this.getContract().getBalance(assetAddress);
  }

  async hasRole(role: string, account: string): Promise<boolean> {
    return this.getContract().hasRole(role, account);
  }

  async isPaused(): Promise<boolean> {
    return this.getContract().paused();
  }

  getSignerAddress(): string {
    if (!this.wallet) {
      throw new Error('PayoutPoolAdapter not initialized');
    }
    return this.wallet.address;
  }
}
