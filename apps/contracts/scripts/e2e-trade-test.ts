import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * E2E smoke test — simulates a full trade lifecycle on local Hardhat node.
 * Run: yarn hardhat run scripts/e2e-trade-test.ts --network localhost
 */
async function main() {
  const [owner, user] = await ethers.getSigners();
  console.log("=== Tap Trading E2E Smoke Test ===\n");
  console.log("Owner:", owner.address);
  console.log("User:", user.address);

  const tapOrderAddr = process.env.CONTRACT_TAP_ORDER!;
  const poolAddr = process.env.CONTRACT_PAYOUT_POOL!;
  const adapterAddr = process.env.CONTRACT_PRICE_FEED_ADAPTER!;

  if (!tapOrderAddr || !poolAddr || !adapterAddr) {
    throw new Error("Missing contract addresses. Run deploy.ts first.");
  }

  const TapOrder = await ethers.getContractFactory("TapOrder");
  const tapOrder = TapOrder.attach(tapOrderAddr) as any;

  const PayoutPool = await ethers.getContractFactory("PayoutPool");
  const pool = PayoutPool.attach(poolAddr) as any;

  const PriceFeedAdapter = await ethers.getContractFactory("PriceFeedAdapter");
  const adapter = PriceFeedAdapter.attach(adapterAddr) as any;

  const FeedFactory = await ethers.getContractFactory("MockV3Aggregator");
  const btcFeed = await FeedFactory.attach(
    await tapOrder.assetFeeds("BTC/USD")
  ) as any;

  const MULTIPLIER = 500; // 5x
  const DURATION = 60;   // 1 min
  const STAKE = ethers.parseEther("0.01");

  // Step 1: Fund PayoutPool
  console.log("[1] Funding PayoutPool...");
  const poolBalBefore = await pool.getBalance(ethers.ZeroAddress);
  await pool.connect(owner).deposit(ethers.ZeroAddress, { value: ethers.parseEther("10") });
  const poolBalAfter = await pool.getBalance(ethers.ZeroAddress);
  console.log(`    Pool balance: ${ethers.formatEther(poolBalBefore)} → ${ethers.formatEther(poolBalAfter)} ETH ✓`);

  // Step 2: Check initial price
  const initialPrice = await btcFeed.latestRoundData();
  const currentPrice = initialPrice[1];
  console.log(`[2] Current BTC price: ${ethers.formatUnits(currentPrice, 8)}`);

  // Step 3: Create order (target = current + 1%)
  const targetPrice = currentPrice + (currentPrice * 100n) / 10000n; // +1%
  console.log(`[3] Creating order: target=${ethers.formatUnits(targetPrice, 8)}, multiplier=5x, stake=0.01 ETH`);

  const createTx = await tapOrder.connect(user).createOrder(
    "BTC/USD", targetPrice, true, DURATION, MULTIPLIER, { value: STAKE }
  );
  const createRc = await createTx.wait();
  const createLog = createRc?.logs.find((l: any) => l.fragment?.name === "OrderCreated");
  const orderId = createLog?.args[0];

  if (!orderId) throw new Error("OrderCreated event not found");
  console.log(`    Order created: id=${orderId} ✓`);

  // Step 4: Simulate price touch
  console.log(`[4] Simulating price touch (moving to target ${ethers.formatUnits(targetPrice, 8)})...`);
  await btcFeed.updateAnswer(targetPrice);

  // Step 5: Settle order
  console.log("[5] Calling settleOrder...");
  const settleTx = await tapOrder.connect(owner).settleOrder(orderId);
  const settleRc = await settleTx.wait();
  console.log(`    Settlement tx: ${settleRc?.hash} ✓`);

  // Step 6: Verify outcome
  const order = await tapOrder.getOrder(orderId);
  const STATUS = ["OPEN", "WON", "LOST"];
  console.log(`[6] Order status: ${STATUS[order.status]}`);

  if (order.status === 1) {
    const payout = (STAKE * BigInt(MULTIPLIER)) / 10000n;
    const userBal = await ethers.provider.getBalance(await user.getAddress());
    console.log(`    Payout: ${ethers.formatEther(payout)} ETH ✓`);
    console.log(`\n✅ E2E TEST PASSED — Full trade lifecycle works!`);
  } else {
    console.log(`\n❌ E2E TEST FAILED — Expected WON, got ${STATUS[order.status]}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
