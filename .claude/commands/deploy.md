# Command: deploy

## Description
Deploy the Tap Trading platform to production — smart contracts on BASE Mainnet + backend/frontend.

## Pre-deploy checklist
```
[ ] All tests pass: `cd be && yarn test` && `cd smc && forge test`
[ ] Contract has been thoroughly internally reviewed
[ ] Production .env is correctly configured (mainnet RPC, ADMIN_PRIVATE_KEY)
[ ] ADMIN_PRIVATE_KEY wallet has enough ETH to pay gas (minimum 0.1 ETH)
[ ] PayoutPool contract has enough liquidity
[ ] Redis and Postgres production backup is set up
[ ] Monitoring + alerts are configured (uptime, worker heartbeat)
[ ] Rate limiting is enabled on Nginx
```

## Step 1: Deploy Smart Contracts to BASE Mainnet
```bash
cd smc

# Final test
yarn hardhat test

# Deploy to mainnet (be careful — cannot be rolled back)
yarn hardhat run scripts/deploy.ts --network base

# Verify source code on Basescan
yarn hardhat verify --network base DEPLOYED_TAP_ORDER_ADDRESS
yarn hardhat verify --network base DEPLOYED_PAYOUT_POOL_ADDRESS

# Fund PayoutPool with initial liquidity
yarn hardhat run scripts/fund-pool.ts --network base -- --amount 1.0
```

> ⚠ After deploying, **copy contract addresses** into:
> - `be/.env` (CONTRACT_TAP_ORDER, CONTRACT_PAYOUT_POOL)
> - `fe/.env.local` (NEXT_PUBLIC_TAP_ORDER_ADDRESS)

## Step 2: Deploy Backend (Docker)
```bash
# Build image
docker build -t tap-backend:latest ./be

# Tag with commit SHA for easy rollback
GIT_SHA=$(git rev-parse --short HEAD)
docker tag tap-backend:latest your-registry/tap-backend:$GIT_SHA
docker tag tap-backend:latest your-registry/tap-backend:latest

# Push to registry
docker push your-registry/tap-backend:$GIT_SHA
docker push your-registry/tap-backend:latest

# Deploy to server
ssh deploy@your-server './deploy.sh'

# Verify
curl https://api.your-domain.com/health
```

## deploy.sh (run on server)
```bash
#!/bin/bash
set -e

echo "=== Tap Trading Deploy ==="
echo "Time: $(date)"

echo "Pulling latest images..."
docker compose pull

echo "Running migrations..."
docker compose run --rm backend yarn migration:up

echo "Restarting services (zero-downtime)..."
docker compose up -d --no-deps --scale backend=2 backend
sleep 10
docker compose up -d --no-deps --scale backend=1 backend

docker compose up -d --no-deps worker

echo "Health check..."
sleep 5
curl -f http://localhost:3001/health || (echo "HEALTH CHECK FAILED" && exit 1)

echo "=== Deploy complete ==="
```

## Step 3: Deploy Frontend (Vercel)
```bash
cd fe

# Set production env vars on Vercel dashboard first, then:
vercel --prod

# Or using Vercel CLI with env:
vercel deploy --prod \
  --env NEXT_PUBLIC_API_URL=https://api.your-domain.com \
  --env NEXT_PUBLIC_CHAIN_ID=8453
```

## Post-deploy verification
```
[ ] GET https://api.your-domain.com/health → { status: "ok" }
[ ] WebSocket connect from browser → no errors
[ ] Price feed: worker logs show "price updated" every ~30s
[ ] Create 1 small test order with a test wallet (0.001 ETH stake)
[ ] Wait for expiry → verify order is automatically settled correctly
[ ] Basescan: check contract events are emitting correctly
[ ] Check PayoutPool balance is sufficient
```

## Rollback procedure

### Rollback Backend
```bash
# On server
docker compose down
# Change image tag in docker-compose.yml to the previous SHA
docker compose up -d
```

### Rollback Contract
```
⚠ Smart contracts on the blockchain CANNOT be rolled back.
If there is a critical bug:
1. Call contract.pause() immediately
2. Deploy a new contract with the fix
3. Update the address in backend + frontend
4. Migrate open orders to the new contract (if needed)
```

### Rollback Frontend
```bash
# On Vercel dashboard: Deployments → select old version → Redeploy
# Or via CLI:
vercel rollback
```
