import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

// Usage: yarn hardhat verify --network base-sepolia <contractAddress> <constructorArgs...>
// Or: yarn hardhat run scripts/verify.ts --network base-sepolia
async function main() {
  const [signer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log("Network chainId:", network.chainId);

  const tapOrderAddr = process.env.CONTRACT_TAP_ORDER;
  const poolAddr = process.env.CONTRACT_PAYOUT_POOL;
  const adapterAddr = process.env.CONTRACT_PRICE_FEED_ADAPTER;

  if (!tapOrderAddr || !poolAddr || !adapterAddr) {
    throw new Error("Missing CONTRACT addresses in .env");
  }

  // Verify PriceFeedAdapter (no constructor args)
  console.log("\nVerifying PriceFeedAdapter...");
  try {
    await run("verify:verify", {
      address: adapterAddr,
      constructorArguments: [],
    });
    console.log("  PriceFeedAdapter verified ✓");
  } catch (e: any) {
    console.log("  PriceFeedAdapter verification:", e.message.slice(0, 100));
  }

  // Verify PayoutPool (no constructor args)
  console.log("\nVerifying PayoutPool...");
  try {
    await run("verify:verify", {
      address: poolAddr,
      constructorArguments: [],
    });
    console.log("  PayoutPool verified ✓");
  } catch (e: any) {
    console.log("  PayoutPool verification:", e.message.slice(0, 100));
  }

  // Verify TapOrder (adapterAddr, poolAddr)
  console.log("\nVerifying TapOrder...");
  try {
    await run("verify:verify", {
      address: tapOrderAddr,
      constructorArguments: [adapterAddr, poolAddr],
    });
    console.log("  TapOrder verified ✓");
  } catch (e: any) {
    console.log("  TapOrder verification:", e.message.slice(0, 100));
  }

  console.log("\nVerification complete. Check https://sepolia.basescan.org/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
