# Tap Trading

Mobile-first gamified price-touch trading on BASE. Predict if BTC/USD touches your target before expiry.

---

## Developer Setup

### 1. Prerequisites

```bash
# Install
node >= 20
pnpm
docker && docker-compose
foundry (forge)
```

### 2. Environment

```bash
# Copy and fill in
cp smc/.env.example smc/.env
cp be/.env.example be/.env
cp fe/.env.local.example fe/.env.local
```

### 3. Start Infra

```bash
docker-compose up -d
```

### 4. Compile Contracts

```bash
cd smc
forge build && yarn compile && yarn typechain:gen
```

### 5. Deploy (Sepolia testnet)

```bash
# Deploy TapOrder + PayoutPool
cd smc
forge script script/Deploy.s.sol --rpc-url $RPC --private-key $PRIVATE_KEY --broadcast

# Update .env with deployed addresses
```

**Manual step:** Copy the deployed contract addresses from the output and update `CONTRACT_TAP_ORDER` and `CONTRACT_PAYOUT_POOL` in `be/.env` and `NEXT_PUBLIC_TAP_ORDER_ADDRESS` in `fe/.env.local`.

### 6. Fund PayoutPool

**Manual step:** Send ETH to PayoutPool contract before any trades can be placed.

```bash
# Check PayoutPool balance
cast call $CONTRACT_PAYOUT_POOL "getBalance(address)(uint256)" $FEED_BTC_USD --rpc-url $RPC
```

### 7. Start Backend

```bash
cd be
yarn install
yarn migration:run
yarn start:dev
```

### 8. Start Frontend

```bash
cd fe
yarn install
yarn dev
```

---

## Development Flow

```
/new-feature [name]  →  Plan feature before coding
/edit, /write         →  Make changes
/yarn test            →  Run tests
/yarn lint && yarn type-check  →  Verify
/commit               →  Commit changes
/pr                   →  Open PR
/checkpoint           →  Update changelog + status + plan
```

### Contract Development

```bash
cd smc

# Edit .sol files
forge build                        # Compile
forge test                         # Run tests
yarn compile && yarn typechain:gen # Generate TypeChain bindings
```

**Manual step:** After `typechain:gen`, update EVM adapter files in `be/src/adapters/` if the ABI changed.

### Backend Development

```bash
cd be

# New module
/backend-module [name]

# Run tests
yarn test

# Migration (after entity change)
/checkpoint first — agent will create migration
```

### Frontend Development

```bash
cd fe

# New component
/frontend-component [name]

# Test
yarn test
```

---

## Key Files

| File | Purpose |
| ---- | ------- |
| `CLAUDE.md` | Project memory — rules, patterns, tech stack |
| `docs/spec-doc.md` | What to build — milestones, mechanics |
| `docs/architecture.md` | How it works — contracts, data flow |
| `docs/project-plan.md` | Implementation steps |
| `docs/project-status.md` | Current progress |

---

## Troubleshooting

**Orders not settling?**
```bash
# Check price feed freshness
curl http://localhost:3002/health/price

# Check worker logs
docker compose -f be/docker-compose.yml --env-file be/docker.env logs worker
```

**Contract tx failing?**
```bash
# Verify PayoutPool has funds
cast call $CONTRACT_PAYOUT_POOL "getBalance(address)(uint256)" $FEED_BTC_USD --rpc-url $RPC

# Check TapOrder is approved to pull funds
cast call $CONTRACT_TAP_ORDER "paused()(bool)" --rpc-url $RPC
```

**Stuck orders?**
```bash
# Manually settle via forge
cast send $CONTRACT_TAP_ORDER "settleOrder(uint256)" <orderId> --rpc-url $RPC --private-key $ADMIN_PRIVATE_KEY
```
