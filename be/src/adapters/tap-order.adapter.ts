import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

@Injectable()
export class TapOrderAdapter implements OnModuleInit {
  /** @type {any} */
  private contract: any = null;
  /** @type {any} */
  private wallet: any = null;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const rpcUrl = this.configService.get<string>('RPC');
    const privateKey = this.configService.get<string>('ADMIN_PRIVATE_KEY');
    const contractAddress = this.configService.get<string>('CONTRACT_TAP_ORDER');

    if (!rpcUrl || !privateKey || !contractAddress || privateKey === '0x...') {
      console.warn('TapOrderAdapter: EVM config missing or placeholder — adapter will not be functional');
      return;
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, provider);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TapOrder__factory } = require('../../../smc/typechain-types/factories/contracts/TapOrder__factory');
    this.contract = TapOrder__factory.connect(contractAddress, this.wallet);
  }

  private getContract(): any {
    if (!this.contract) {
      throw new Error('TapOrderAdapter not initialized — check EVM configuration');
    }
    return this.contract;
  }

  async createOrder(params: {
    assetKey: string;
    targetPrice: bigint;
    isAbove: boolean;
    durationSecs: number;
    multiplierBps: number;
    stakeWei: bigint;
  }): Promise<{
    receipt: ethers.TransactionReceipt;
    orderId: bigint;
    expiry: bigint;
  }> {
    const contract = this.getContract();
    const tx = await contract.createOrder(
      params.assetKey,
      params.targetPrice,
      params.isAbove,
      params.durationSecs,
      params.multiplierBps,
      { value: params.stakeWei },
    );
    const receipt = await tx.wait();

    let orderId = 0n;
    let expiry = 0n;

    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === 'OrderCreated') {
          orderId = parsed.args[0] as bigint;
          expiry = parsed.args[6] as bigint;
          break;
        }
      } catch {
        // Not a TapOrder log, skip
      }
    }

    return { receipt, orderId, expiry };
  }

  async settleOrder(orderId: bigint): Promise<{
    orderId: bigint;
    isWon: boolean;
    payoutWei: bigint;
    txHash: string;
  }> {
    const contract = this.getContract();
    const tx = await contract.settleOrder(orderId);
    const receipt = await tx.wait();

    let isWon = false;
    let payoutWei = 0n;

    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === 'OrderWon') {
          isWon = true;
          payoutWei = parsed.args[2] as bigint;
        }
      } catch {
        // Not a TapOrder log, skip
      }
    }

    return { orderId, isWon, payoutWei, txHash: receipt.hash };
  }

  async batchSettle(orderIds: bigint[]): Promise<ethers.TransactionReceipt> {
    const tx = await this.getContract().batchSettle(orderIds);
    return tx.wait();
  }

  async isPaused(): Promise<boolean> {
    return this.getContract().paused();
  }

  async getNextOrderId(): Promise<bigint> {
    return this.getContract().nextOrderId();
  }

  async isSettled(orderId: bigint): Promise<boolean> {
    return this.getContract().settled(orderId);
  }

  getSignerAddress(): string {
    if (!this.wallet) {
      throw new Error('TapOrderAdapter not initialized');
    }
    return this.wallet.address;
  }
}
