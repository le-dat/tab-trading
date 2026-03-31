# Command: price-feed-check

## Description
Check that Chainlink price feeds are working correctly on the BASE network before creating a new order.

## Quick check script
```typescript
// scripts/check-price-feeds.ts
import { ethers } from 'ethers';

const FEEDS = {
  'BTC/USD': process.env.FEED_BTC_USD,
  'ETH/USD': process.env.FEED_ETH_USD,
  'XAU/USD': process.env.FEED_XAU_USD,
};

const ABI = [
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
];

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC);

  for (const [name, addr] of Object.entries(FEEDS)) {
    if (!addr) { console.log(`${name}: ⚠ address not set`); continue; }
    const feed = new ethers.Contract(addr, ABI, provider);
    const [roundId, answer, , updatedAt] = await feed.latestRoundData();
    const decimals = await feed.decimals();
    const price = Number(ethers.formatUnits(answer, decimals));
    const ageSeconds = Math.floor(Date.now() / 1000) - Number(updatedAt);

    console.log(`\n${name}:`);
    console.log(`  Price:   $${price.toLocaleString()}`);
    console.log(`  Age:     ${ageSeconds}s`);
    console.log(`  Round:   ${roundId}`);
    console.log(`  Status:  ${ageSeconds < STALE_THRESHOLDS[name] ? '✅ FRESH' : '🚨 STALE'}`);
  }
}

const STALE_THRESHOLDS: Record<string, number> = {
  'BTC/USD': 60,
  'ETH/USD': 60,
  'XAU/USD': 3600,
};

main().catch(console.error);
```

```bash
yarn hardhat run scripts/check-price-feeds.ts --network base-sepolia
```

## Chainlink Feed Addresses

### BASE Sepolia Testnet (chainId: 84532)
```
BTC/USD:  0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298
ETH/USD:  0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1
LINK/USD: 0xb113F5A928BCfF189C998ab20d753a47F9dE5A61
```

### BASE Mainnet (chainId: 8453)
```
BTC/USD:  0xCCADC697c55bbB68dc5bCdf8d3CBe83CdD4E071E
ETH/USD:  0x71041dddad3595F9CEd3dCCFBe3D1F4b0a16Bb70
```
> See more at: https://docs.chain.link/data-feeds/price-feeds/addresses?network=base

## Stale price thresholds (used in backend)
```typescript
// src/modules/price/price.constants.ts
export const STALE_THRESHOLDS_MS: Record<string, number> = {
  'BTC/USD': 60_000,    // 60 seconds
  'ETH/USD': 60_000,
  'XAU/USD': 3_600_000, // 1 hour
};

// Validate in PriceService before allowing order creation
export function assertPriceFresh(asset: string, updatedAt: number): void {
  const threshold = STALE_THRESHOLDS_MS[asset] ?? 60_000;
  if (Date.now() - updatedAt > threshold) {
    throw new StalePriceException(`Price feed for ${asset} is stale`);
  }
}
```

## Check in Worker logs
```bash
# Price feed is working normally
docker logs tap-worker --tail 50 | grep "price"
# Expected:
# [PriceWorker] BTC/USD updated: 65432.10 (age: 12s)
# [PriceWorker] ETH/USD updated: 3456.78 (age: 8s)

# Signs of staleness:
# [PriceWorker] ⚠ BTC/USD stale: last update 95s ago
```

## Incident response when feed stops updating
```
1. Check Chainlink status: https://status.chain.link
2. Pause new order acceptance:
   await contract.pause()                     // on-chain
   await redis.set('system:paused', 'true')   // backend gate
3. Add banner on frontend: "Trading temporarily paused"
4. Wait for feed to recover → verify ageSeconds < threshold
5. Unpause:
   await contract.unpause()
   await redis.del('system:paused')
```
