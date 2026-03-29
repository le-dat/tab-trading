import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

// Usage: yarn hardhat run scripts/manual-settle.ts --network base-sepolia -- --orderId 1
interface Args {
  orderId: string;
}

async function main() {
  const args: Args = require("yargs")
    .option("orderId", { type: "string", demandOption: true })
    .parseSync() as Args;

  const [signer] = await ethers.getSigners();
  const tapOrderAddr = process.env.CONTRACT_TAP_ORDER;
  if (!tapOrderAddr) throw new Error("CONTRACT_TAP_ORDER not set in .env");

  const TapOrder = await ethers.getContractFactory("TapOrder");
  const tapOrder = TapOrder.attach(tapOrderAddr) as any;

  const orderId = BigInt(args.orderId);
  const order = await tapOrder.getOrder(orderId);

  console.log(`Settling order #${orderId}...`);
  console.log("  User:", order.user);
  console.log("  Status:", ["OPEN", "WON", "LOST"][order.status]);

  const tx = await tapOrder.connect(signer).settleOrder(orderId);
  console.log("  Tx sent:", tx.hash);

  const rc = await tx.wait();
  console.log("  Confirmed in block:", rc?.blockNumber);

  // Fetch updated order
  const updated = await tapOrder.getOrder(orderId);
  console.log("  New status:", ["OPEN", "WON", "LOST"][updated.status]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
