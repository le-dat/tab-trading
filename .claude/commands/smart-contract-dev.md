# Command: smart-contract-dev

## Mô tả
Workflow phát triển, test, và deploy smart contracts cho Tap Trading trên BASE chain.

---

## Project structure (apps/contracts/)

```
contracts/
  TapOrder.sol              ← main trading contract
  PriceFeedAdapter.sol      ← Chainlink oracle wrapper
  PayoutPool.sol            ← liquidity management
  mocks/
    MockV3Aggregator.sol    ← mock Chainlink feed cho local testing
test/
  TapOrder.test.ts
  PriceFeedAdapter.test.ts
  PayoutPool.test.ts
scripts/
  deploy.ts                 ← deploy all contracts
  verify.ts                 ← verify on Basescan
  fund-pool.ts              ← fund PayoutPool after deploy
  check-order.ts            ← inspect order state on-chain
  manual-settle.ts          ← manually trigger settlement
  e2e-trade-test.ts         ← full trade flow smoke test
typechain-types/            ← AUTO-GENERATED — never edit directly
hardhat.config.ts
```

---

## Workflow chuẩn

### Khi viết contract mới hoặc thêm function
```
1. Viết function trong .sol file
2. Viết unit test trong test/*.test.ts — cover happy path + ALL edge cases
3. yarn hardhat test               ← phải 100% pass trước khi tiếp
4. yarn typechain:gen              ← update TypeScript bindings
5. Update apps/backend/src/adapters/ để dùng function mới
```

### Khi deploy lên testnet
```bash
yarn hardhat run scripts/deploy.ts --network base-sepolia
yarn hardhat run scripts/fund-pool.ts --network base-sepolia -- --amount 0.5
yarn hardhat verify --network base-sepolia CONTRACT_ADDRESS CONSTRUCTOR_ARGS
```

### Khi test locally với mock price feed
```typescript
// Trong test file: dùng MockV3Aggregator thay vì Chainlink thật
const mockFeed = await deployMockV3Aggregator(8, parseUnits("65000", 8));
await tapOrder.setAssetFeed(BTC_ASSET, mockFeed.address);

// Simulate price touch:
await mockFeed.updateAnswer(parseUnits("66000", 8));  // price moves up
await tapOrder.settleOrder(orderId);                   // should WIN

// Simulate stale feed:
await time.increase(61);                               // advance 61 seconds
await expect(tapOrder.createOrder(...)).to.be.revertedWith("StalePriceFeed");
```

---

## Critical test cases — PHẢI có đủ trước khi merge

```typescript
describe("TapOrder — settlement", () => {
  it("settles WIN when price touches target exactly (inclusive)")
  it("settles WIN when price gaps through target")
  it("settles LOST when expiry reached without touch")
  it("reverts when settling an already settled order (idempotent)")
  it("reverts when Chainlink feed is stale (>60s)")
  it("reverts when PayoutPool has insufficient liquidity")
  it("correctly transfers payout = stake × multiplier to user")
  it("emits OrderWon with correct args on win")
  it("emits OrderLost with correct args on loss")
  it("batchSettle handles partial failures without reverting whole batch")
})

describe("TapOrder — createOrder", () => {
  it("locks stake (msg.value) in contract")
  it("reverts when asset is not whitelisted")
  it("reverts when contract is paused")
  it("reverts when multiplier is not in allowed list")
  it("assigns incrementing orderId correctly")
})

describe("TapOrder — access control", () => {
  it("only owner can pause/unpause")
  it("only TapOrder can call PayoutPool.payout()")
  it("settleOrder is permissionless (anyone can call)")
})

describe("PriceFeedAdapter", () => {
  it("returns correct price and updatedAt from Chainlink")
  it("reverts if price <= 0")
  it("reverts if updatedAt > STALE_THRESHOLD seconds ago")
})
```

---

## Hardhat config (hardhat.config.ts)

```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@typechain/hardhat";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    "base-sepolia": {
      url: process.env.RPC,
      accounts: [process.env.ADMIN_PRIVATE_KEY!],
      chainId: 84532,
    },
    "base": {
      url: process.env.RPC_MAINNET,
      accounts: [process.env.ADMIN_PRIVATE_KEY!],
      chainId: 8453,
    },
  },
  typechain: {
    outDir: "../backend/src/adapters/typechain",
    target: "ethers-v6",
  },
  etherscan: {
    apiKey: { "base-sepolia": process.env.BASESCAN_API_KEY! },
    customChains: [{
      network: "base-sepolia",
      chainId: 84532,
      urls: {
        apiURL: "https://api-sepolia.basescan.org/api",
        browserURL: "https://sepolia.basescan.org",
      },
    }],
  },
};

export default config;
```

---

## Deploy script pattern (scripts/deploy.ts)

```typescript
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)));

  // 1. Deploy PriceFeedAdapter
  const PriceFeedAdapter = await ethers.getContractFactory("PriceFeedAdapter");
  const adapter = await PriceFeedAdapter.deploy();
  await adapter.waitForDeployment();
  console.log("PriceFeedAdapter:", await adapter.getAddress());

  // 2. Deploy PayoutPool
  const PayoutPool = await ethers.getContractFactory("PayoutPool");
  const pool = await PayoutPool.deploy();
  await pool.waitForDeployment();
  console.log("PayoutPool:", await pool.getAddress());

  // 3. Deploy TapOrder
  const TapOrder = await ethers.getContractFactory("TapOrder");
  const tapOrder = await TapOrder.deploy(
    await adapter.getAddress(),
    await pool.getAddress()
  );
  await tapOrder.waitForDeployment();
  console.log("TapOrder:", await tapOrder.getAddress());

  // 4. Grant TapOrder permission to call PayoutPool.payout()
  await pool.grantRole(await pool.PAYOUT_ROLE(), await tapOrder.getAddress());
  console.log("Roles configured");

  // 5. Whitelist assets
  await tapOrder.addAsset(process.env.FEED_BTC_USD, "BTC/USD");
  await tapOrder.addAsset(process.env.FEED_ETH_USD, "ETH/USD");
  console.log("Assets whitelisted");

  console.log("\n=== Copy these to .env ===");
  console.log(`CONTRACT_TAP_ORDER=${await tapOrder.getAddress()}`);
  console.log(`CONTRACT_PAYOUT_POOL=${await pool.getAddress()}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

---

## Sau khi deploy, luôn chạy smoke test
```bash
yarn hardhat run scripts/e2e-trade-test.ts --network base-sepolia
# Expected output:
# [1] Order created: id=1, stake=0.001 ETH, target=$66000
# [2] Simulating price touch...
# [3] Settlement tx confirmed: 0xabc...
# [4] Payout received: 0.005 ETH ✓
```

---

## Checklist trước khi merge contract changes

```
[ ] yarn hardhat test → 100% pass
[ ] yarn typechain:gen → bindings updated
[ ] apps/backend/src/adapters/ updated để match new ABI
[ ] deploy.ts script updated nếu constructor params thay đổi
[ ] docs/architecture.md section "Smart Contract Architecture" updated
[ ] /update-docs chạy xong
```
