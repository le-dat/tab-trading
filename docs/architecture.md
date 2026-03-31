# Tap Trading — System Architecture

> [ [CLAUDE.md](../CLAUDE.md) ] [ [Spec](spec-doc.md) ] [ [Architecture](architecture.md) ] [ [Plan](project-plan.md) ] [ [Status](project-status.md) ] [ [Changelog](changelog.md) ]

> Update this file after any major system change.
> Claude reads this to understand how the system is structured.

---

## High-Level Overview

Derived from [Project Specification](spec-doc.md).

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                         │
│   Next.js PWA (mobile-first)  ←→  Socket.io (realtime) │
└─────────────────┬───────────────────────┬───────────────┘
                  │ REST API              │ WebSocket
┌─────────────────▼───────────────────────▼───────────────┐
│                  BACKEND LAYER                          │
│   NestJS API (:3001)    NestJS Worker (:3002)           │
│   auth / order /        price / settlement /            │
│   payment / account     distribution / socket           │
└──────┬──────┬──────┬──────┬──────────────┬─────────────┘
       │      │      │      │              │
   Postgres Redis  Kafka  MinIO         EVM RPC
                              │
┌─────────────────────────────▼───────────────────────────┐
│                  BLOCKCHAIN LAYER (BASE)                │
│   TapOrder.sol  ←  Chainlink AggregatorV3               │
│   PayoutPool.sol                                        │
└─────────────────────────────────────────────────────────┘
```

---

## Repository Structure

```
tap-trading/                        ← monorepo root
├── CLAUDE.md                       ← Claude's memory
├── .claude/
│   ├── settings.json
│   ├── commands/                   ← slash commands
│   ├── agents/                     ← subagents
│   └── hooks/                      ← automation hooks
├── [docs/]()
│   ├── [spec-doc.md](spec-doc.md)                 ← this project's spec
│   ├── [architecture.md](architecture.md)             ← this file
│   ├── [changelog.md](changelog.md)                ← feature history
│   └── [project-status.md](project-status.md)          ← session tracking
├── apps/
│   ├── contracts/                  ← Hardhat project
│   │   ├── contracts/
│   │   │   ├── TapOrder.sol
│   │   │   ├── PriceFeedAdapter.sol
│   │   │   ├── PayoutPool.sol
│   │   │   └── mocks/MockV3Aggregator.sol
│   │   ├── test/
│   │   ├── scripts/
│   │   └── typechain-types/        ← auto-generated, do not edit
│   │
│   ├── backend/
│   │   └── src/
│   │       ├── adapters/           ← EVM contract adapters
│   │       ├── config/             ← NestJS config modules
│   │       ├── libs/               ← shared libs (logger, utils)
│   │       ├── migrations/         ← TypeORM migrations
│   │       ├── modules/
│   │       │   ├── auth/           ← Privy JWT auth
│   │       │   ├── account/        ← user account management
│   │       │   ├── order/          ← order lifecycle
│   │       │   ├── settlement/     ← auto-settlement worker
│   │       │   ├── payment/        ← deposit/withdraw
│   │       │   ├── distribution/   ← payout distribution
│   │       │   ├── price/          ← Chainlink price ingestion
│   │       │   ├── risk/           ← risk checks, exposure limits
│   │       │   ├── strategy/       ← multiplier pricing
│   │       │   ├── socket/         ← Socket.io gateway
│   │       │   └── worker/         ← background jobs
│   │       └── scripts/
│   │
│   └── frontend/
│       └── app/
│           ├── (auth)/             ← login screen
│           ├── (trading)/          ← main trade screen
│           ├── (history)/          ← trade history
│           └── (wallet)/           ← balance & wallet
│
└── packages/
    └── shared/                     ← shared TypeScript types, ABIs, utils
```

---

## Smart Contract Architecture

### TapOrder.sol — Main contract

```
State:
  mapping(uint256 => Order) orders
  uint256 nextOrderId
  IPriceFeedAdapter priceFeedAdapter
  IPayoutPool payoutPool
  bool paused

Order struct:
  address user
  address asset          ← Chainlink feed address
  int256  targetPrice
  bool    isAbove        ← touch above or below current
  uint256 stake          ← ETH locked
  uint256 multiplierBps  ← e.g. 500 = 5x (basis points)
  uint256 expiry         ← unix timestamp
  Status  status         ← OPEN | WON | LOST

Key functions:
  createOrder(asset, targetPrice, isAbove, duration, multiplierBps)
    → payable, locks msg.value as stake
    → emits OrderCreated
  settleOrder(orderId)
    → anyone can call (trustless)
    → checks current price vs target
    → if touch: transfers stake × multiplier from PayoutPool to user
    → if expired: marks LOST
    → emits OrderWon or OrderLost
  batchSettle(orderIds[])
    → gas-efficient bulk settlement for worker
  pause() / unpause()
    → owner only, emergency stop
```

### PriceFeedAdapter.sol — Chainlink wrapper

```
getLatestPrice(asset) → (int256 price, uint256 updatedAt)
  → reads from Chainlink AggregatorV3Interface
  → reverts if updatedAt > STALE_THRESHOLD (60s for BTC/ETH)
  → reverts if price <= 0
```

### PayoutPool.sol — Liquidity management

```
State:
  mapping(address => uint256) balance   ← per-asset liquidity
  uint256 operatorFeeBps                ← house fee (e.g. 150 = 1.5%)

Key functions:
  deposit(asset) payable
  withdraw(asset, amount)               ← owner only
  payout(user, amount)                  ← only callable by TapOrder
  getBalance(asset) → uint256
```

---

## Backend Module Map

| Module       | Port/Role             | Key Dependencies                        | Kafka Topics          |
| ------------ | --------------------- | --------------------------------------- | --------------------- |
| auth         | REST /auth/\*         | Privy SDK, JWT, Redis                   | —                     |
| account      | REST /account/\*      | PostgreSQL, auth                        | —                     |
| order        | REST /orders/\*       | PostgreSQL, risk, strategy, EVM adapter | order.created         |
| settlement   | Worker background     | Redis price cache, EVM adapter          | order.won, order.lost |
| payment      | REST /payments/\*     | EVM adapter, PostgreSQL                 | payment.processed     |
| distribution | Kafka consumer        | PostgreSQL, EVM adapter                 | settlement.processed  |
| price        | Worker event listener | Ethers.js WS, Redis, Kafka              | price.updated         |
| risk         | Internal service      | Redis, PostgreSQL                       | —                     |
| strategy     | Internal service      | price service, config                   | —                     |
| socket       | Socket.io gateway     | Redis pub/sub, Kafka                    | —                     |
| worker       | Standalone app :3002  | All above modules                       | —                     |

---

## Data Flow — Create & Settle Order

```
[Frontend] User taps "TRADE"
    ↓
[API /orders POST] Validate JWT → check risk limits → calc multiplier
    ↓
[EVM Adapter] contract.createOrder() → tx sent to BASE
    ↓
[PostgreSQL] Save order record with status=OPEN + tx_hash
    ↓
[Kafka] Publish order.created
    ↓
[Worker - Settlement] Subscribes to price.updated events
    ↓ (every price update, checks all OPEN orders)
    ↓ price touches target?
   YES → contract.settleOrder(orderId) → PayoutPool transfers to user
       → Kafka: order.won { orderId, payout }
       → Socket.io: push to user → WIN animation
    NO → wait
    ↓ expiry reached without touch?
   YES → contract.expireOrder(orderId) → status=LOST
       → Kafka: order.lost { orderId }
       → Socket.io: push to user → LOSE animation
```

---

## Database Schema

```sql
-- Core tables

users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address  VARCHAR(42) UNIQUE NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
)

orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id),
  asset           VARCHAR(20) NOT NULL,       -- 'BTC/USD'
  target_price    NUMERIC(20,8) NOT NULL,
  is_above        BOOLEAN NOT NULL,
  stake_wei       NUMERIC(30,0) NOT NULL,     -- in wei
  multiplier_bps  INTEGER NOT NULL,           -- 500 = 5x
  expiry          TIMESTAMPTZ NOT NULL,
  status          VARCHAR(10) DEFAULT 'OPEN', -- OPEN|WON|LOST
  on_chain_id     BIGINT,                     -- contract orderId
  create_tx_hash  VARCHAR(66),
  settle_tx_hash  VARCHAR(66),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
)

settlements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID REFERENCES orders(id) UNIQUE,
  settled_at      TIMESTAMPTZ,
  payout_wei      NUMERIC(30,0),
  tx_hash         VARCHAR(66),
  created_at      TIMESTAMPTZ DEFAULT NOW()
)

payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id),
  type            VARCHAR(20),  -- DEPOSIT | WITHDRAW | PAYOUT
  amount_wei      NUMERIC(30,0),
  tx_hash         VARCHAR(66),
  created_at      TIMESTAMPTZ DEFAULT NOW()
)
```

---

## Environment Variables Reference

```bash
# apps/backend/.env
NODE_ENV=development
PORT=3001
WORKER_PORT=3002
NETWORK=testnet                   # testnet | mainnet

POSTGRES_URL=postgres://root:1@localhost:5432/tapl
REDIS_URL=redis://default:foobared@localhost:6379/0

KAFKA_BROKER=localhost:39092
KAFKA_TOPIC_PREFIX=local-tapl
KAFKA_RUNNING_FLAG=true

MINIO_HOST=localhost
MINIO_PORT=32126
MINIO_ACCESS_KEY=development
MINIO_SECRET_KEY=123456789
BUCKET_NAME=development

RPC=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
ADMIN_PRIVATE_KEY=0x...
CONTRACT_TAP_ORDER=0x...
CONTRACT_PAYOUT_POOL=0x...

JWT_SECRET=your-jwt-secret
PRIVY_APP_ID=your-privy-app-id
PRIVY_APP_SECRET=your-privy-secret

# Chainlink feed addresses (BASE Sepolia)
FEED_BTC_USD=0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298
FEED_ETH_USD=0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1

# apps/frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_TAP_ORDER_ADDRESS=0x...
```

---

## Architectural Decisions

| Decision                                   | Rationale                                                                                                                     | Date |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ---- |
| BASE chain over Ethereum mainnet           | Lower gas fees → smaller stakes viable. EVM-compatible so same tooling.                                                       | —    |
| Chainlink oracle (not internal price feed) | Trustless price source → users can verify settlement on-chain. No way to manipulate price.                                    | —    |
| NestJS Worker as separate process          | Settlement loop must not block API. Separate process = independent scaling + restart without downtime.                        | —    |
| Privy for auth                             | Embedded wallet = web2-like UX without losing self-custody. No seed phrase friction for new users.                            | —    |
| Kafka over direct DB events                | Decouples settlement from order creation. Settlement worker can lag without blocking trades. Replay on crash.                 | —    |
| Fixed multiplier tiers for MVP             | Dynamic pricing (based on volatility) is complex. Fixed tiers ship faster and are easier to audit for house edge correctness. | —    |
| Redis for price cache (not DB)             | Settlement worker checks price every 100ms. DB cannot handle this read rate. Redis read latency ~0.1ms.                       | —    |
