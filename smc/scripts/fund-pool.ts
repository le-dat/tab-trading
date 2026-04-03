import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

// Usage: yarn hardhat run scripts/fund-pool.ts --network base-sepolia -- --amount 0.5
interface Args {
  amount: string;
}

async function main() {
  const args: Args = require("yargs")
    .option("amount", {
      type: "string",
      default: "0.5",
      description: "Amount of ETH to fund the pool with",
    })
    .parseSync() as Args;

  const [signer] = await ethers.getSigners();
  const poolAddr = process.env.CONTRACT_PAYOUT_POOL;
  if (!poolAddr) throw new Error("CONTRACT_PAYOUT_POOL not set in .env");

  const PayoutPool = await ethers.getContractFactory("PayoutPool");
  const pool = PayoutPool.attach(poolAddr) as any;

  const amountWei = ethers.parseEther(args.amount);
  console.log(`Funding PayoutPool (${poolAddr}) with ${args.amount} ETH...`);

  const tx = await pool.connect(signer).deposit(ethers.ZeroAddress, { value: amountWei });
  const rc = await tx.wait();
  console.log("Transaction confirmed:", rc?.hash);

  const newBalance = await pool.getBalance(ethers.ZeroAddress);
  console.log(`Pool balance: ${ethers.formatEther(newBalance)} ETH`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
