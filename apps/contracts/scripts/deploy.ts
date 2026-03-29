import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(bal), "ETH");

  // 1. Deploy PriceFeedAdapter
  console.log("\n[1/5] Deploying PriceFeedAdapter...");
  const PriceFeedAdapter = await ethers.getContractFactory("PriceFeedAdapter");
  const adapter = await PriceFeedAdapter.deploy();
  await adapter.waitForDeployment();
  const adapterAddr = await adapter.getAddress();
  console.log("  PriceFeedAdapter:", adapterAddr);

  // 2. Deploy PayoutPool
  console.log("\n[2/5] Deploying PayoutPool...");
  const PayoutPool = await ethers.getContractFactory("PayoutPool");
  const pool = await PayoutPool.deploy();
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log("  PayoutPool:", poolAddr);

  // 3. Deploy TapOrder
  console.log("\n[3/5] Deploying TapOrder...");
  const TapOrder = await ethers.getContractFactory("TapOrder");
  const tapOrder = await TapOrder.deploy(adapterAddr, poolAddr);
  await tapOrder.waitForDeployment();
  const tapOrderAddr = await tapOrder.getAddress();
  console.log("  TapOrder:", tapOrderAddr);

  // 4. Grant TapOrder permission to call PayoutPool.payout()
  console.log("\n[4/5] Configuring roles...");
  const PAYOUT_ROLE = await pool.PAYOUT_ROLE();
  const tx = await pool.grantRole(PAYOUT_ROLE, tapOrderAddr);
  await tx.wait();
  console.log("  PAYOUT_ROLE granted to TapOrder ✓");

  // 5. Whitelist assets from env
  const btcFeed = process.env.FEED_BTC_USD;
  const ethFeed = process.env.FEED_ETH_USD;

  if (btcFeed) {
    await (await tapOrder.addAsset("BTC/USD", btcFeed)).wait();
    await (await adapter.setFeed("BTC/USD", btcFeed)).wait();
    console.log("  BTC/USD whitelisted:", btcFeed);
  }
  if (ethFeed) {
    await (await tapOrder.addAsset("ETH/USD", ethFeed)).wait();
    await (await adapter.setFeed("ETH/USD", ethFeed)).wait();
    console.log("  ETH/USD whitelisted:", ethFeed);
  }

  console.log(`
=== Deployment Complete ===

CONTRACT_TAP_ORDER=${tapOrderAddr}
CONTRACT_PAYOUT_POOL=${poolAddr}
CONTRACT_PRICE_FEED_ADAPTER=${adapterAddr}

Copy these values to your backend .env file.
Next: Fund PayoutPool → yarn hardhat run scripts/fund-pool.ts --network base-sepolia
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
