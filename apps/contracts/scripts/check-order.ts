import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

// Usage: yarn hardhat run scripts/check-order.ts --network base-sepolia -- --orderId 1
interface Args {
  orderId: string;
}

async function main() {
  const args: Args = require("yargs")
    .option("orderId", { type: "string", demandOption: true })
    .parseSync() as Args;

  const tapOrderAddr = process.env.CONTRACT_TAP_ORDER;
  if (!tapOrderAddr) throw new Error("CONTRACT_TAP_ORDER not set in .env");

  const TapOrder = await ethers.getContractFactory("TapOrder");
  const tapOrder = TapOrder.attach(tapOrderAddr) as any;

  const orderId = BigInt(args.orderId);
  const order = await tapOrder.getOrder(orderId);

  const STATUS = ["OPEN", "WON", "LOST"];
  console.log(`
=== Order #${orderId} ===

  User:        ${order.user}
  Asset key:   ${order.assetKey}
  Target:      ${ethers.formatUnits(order.targetPrice, 8)} (${order.isAbove ? "ABOVE ↑" : "BELOW ↓"})
  Stake:       ${ethers.formatEther(order.stake)} ETH
  Multiplier:  ${Number(order.multiplierBps) / 100}x
  Expiry:      ${new Date(Number(order.expiry) * 1000).toISOString()}
  Status:      ${STATUS[order.status] ?? "UNKNOWN"}
  `);

  const settled = await tapOrder.settled(orderId);
  console.log("  Already settled:", settled);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
