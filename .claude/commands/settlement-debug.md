# Command: settlement-debug

## Description
Debug when settlement is not working correctly — an order is not settled even though the price has touched the target.

## Debug checklist in order

### 1. Check if Price Feed is updating
```bash
# Redis: view the latest price
redis-cli GET "price:BTC/USD"
# Expected: { "value": "65000.12345678", "updatedAt": 1234567890000 }
# If null → price worker has not started or Chainlink event has not fired

# Worker logs
docker logs tap-worker --tail 100 | grep "price"
```

### 2. Check if Settlement Worker is running
```bash
docker logs tap-worker --tail 100 | grep "settlement"
# Expected: "Checking 5 open orders" every 100ms
# If no log → worker process has died, restart it
docker restart tap-worker
```

### 3. Check Order status in DB
```sql
SELECT id, asset, target_price, current_price_at_create,
       is_above, expiry, status, tx_hash
FROM orders
WHERE status = 'OPEN'
ORDER BY created_at DESC;
```

### 4. Check Contract directly
```bash
cd smc
# Check order on-chain
yarn hardhat run scripts/check-order.ts --network base-sepolia
# Expected output: { orderId, status, currentPrice, targetPrice }
```

### 5. Check RPC connectivity
```typescript
// scripts/check-rpc.ts
const provider = new ethers.JsonRpcProvider(process.env.RPC);
const blockNumber = await provider.getBlockNumber();
console.log('Block:', blockNumber);
const price = await priceFeed.latestRoundData();
console.log('BTC price:', price.answer.toString());
```

### 6. Common causes & fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Price not updating | Chainlink WS disconnect | Restart worker, check RPC WebSocket |
| Order not settled despite price touching target | Worker not running | `docker restart tap-worker` |
| Settlement tx reverts | Stale price (>60s old) | Check `updatedAt` in price cache |
| Settlement tx reverts | Order already settled | Check idempotency guard in contract |
| Payout not sent to user's wallet | PayoutPool lacks liquidity | Add more ETH to the pool contract |
| Gas estimation fails | RPC rate limit | Upgrade RPC plan or switch provider |
| batchSettle only partially settles | Gas limit too low | Reduce batch size to 10-20 orders |

### 7. Simulate settlement manually
```bash
cd smc
# Call settleOrder directly to test
yarn hardhat run scripts/manual-settle.ts --network base-sepolia -- --orderId 42
```

### 8. Check idempotency
```typescript
// Call settleOrder twice with the same orderId → second call must revert with "Already settled"
// If it does NOT revert → critical bug, stop production immediately
const tx1 = await contract.settleOrder(orderId); // OK
const tx2 = await contract.settleOrder(orderId); // must throw
```

### 9. Emergency: Pause platform if settlement is being exploited
```bash
# Call pause() on the contract
yarn hardhat run scripts/pause.ts --network base-sepolia
# Then update the frontend banner to notify users
```
