# Command: dev-setup

## Description
Start the full local development environment for the Tap Trading platform.

## Prerequisites
- Node.js v23+
- Yarn
- Docker Desktop running
- .env file created from .env.example

## Steps

### Step 1: Start infrastructure services
```bash
docker compose --env-file docker.env up -d
# Wait for services to be healthy (~30s)
docker compose ps  # check all status=healthy
```

### Step 2: Install dependencies
```bash
yarn install  # root workspaces — installs all apps/* and packages/*
```

### Step 3: Generate contract TypeScript bindings
```bash
cd apps/contracts
yarn compile       # compile Solidity first
yarn typechain:gen # output to apps/backend/src/adapters/typechain/
```

### Step 4: Run database migrations
```bash
cd apps/backend
yarn migration:generate  # if there are new schema changes
yarn migration:up        # apply all pending migrations
```

### Step 5: Deploy contracts to testnet (first time only)
```bash
cd apps/contracts
yarn hardhat run scripts/deploy.ts --network base-sepolia
# Copy output addresses into:
# apps/backend/.env  → CONTRACT_TAP_ORDER, CONTRACT_PAYOUT_POOL
# apps/frontend/.env.local → NEXT_PUBLIC_TAP_ORDER_ADDRESS
```

### Step 6: Start Backend API
```bash
cd apps/backend
yarn dev
# Expected log: [NestApplication] Nest application successfully started on port 3001
```

### Step 7: Start Worker (separate terminal tab)
```bash
cd apps/backend
yarn dev:worker
# Expected log: [WorkerService] Started — listening for price events
# Expected log: [PriceWorker] BTC/USD updated: $65432 (age: 12s)
```

### Step 8: Start Frontend
```bash
cd apps/frontend
yarn dev
# Expected: ready on http://localhost:3000
```

## Verification checklist
```
[ ] http://localhost:3001/health → { status: "ok", db: "ok", redis: "ok" }
[ ] http://localhost:3000 → Trading UI loads without console errors
[ ] Worker log: "price updated" appears every ~30s
[ ] WebSocket: open browser console → socket.connected = true
[ ] Redis: redis-cli GET "price:BTC/USD" → has data, not null
```

## Common Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| Kafka connection refused | Kafka/Zookeeper not healthy yet | `docker compose restart kafka zookeeper` then wait 20s |
| Migration fail | Wrong POSTGRES_URL or DB not ready | Check `docker compose ps postgres`, verify URL in .env |
| TypeChain not generated | Contracts not compiled yet | Run `yarn compile` first in apps/contracts |
| RPC timeout | Invalid endpoint | Replace RPC with Alchemy or Infura BASE Sepolia endpoint |
| Port 3001 already in use | Old process not terminated | `lsof -ti:3001 | xargs kill` |
| MinIO access denied | Wrong credentials | Check MINIO_ACCESS_KEY, MINIO_SECRET_KEY in .env vs docker.env |

## Full Reset (when you want to start fresh)
```bash
docker compose down -v        # removes volumes (loses DB data)
docker compose --env-file docker.env up -d
cd apps/backend && yarn migration:up
```
