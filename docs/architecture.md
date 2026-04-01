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
tap-trading/                        ← project root (NOT a monorepo — each package manages own deps)
├── CLAUDE.md                       ← Claude's memory
├── .claude/
│   ├── commands/                   ← slash commands
│   ├── agents/                     ← subagents
│   └── hooks/                      ← automation hooks
├── docs/                           ← project documentation
├── be/                             ← NestJS backend (Docker infra lives here)
│   ├── docker-compose.yml          ← Postgres :5434, Redis :6380, Kafka :29093, MinIO :9002
│   ├── docker.env                  ← Docker secrets (gitignored)
│   ├── package.json
│   └── src/
│       ├── entities/               ← TypeORM entities (Order, User, Settlement, Payment)
│       ├── modules/                ← NestJS modules (auth, order, settlement, price, kafka, ...)
│       ├── adapters/               ← EVM contract adapters (TapOrder, PayoutPool)
│       ├── config/                 ← data-source.ts, app config
│       ├── migrations/             ← TypeORM migrations
│       └── main.ts
├── smc/                            ← Foundry + Hardhat smart contracts
│   ├── contracts/
│   │   ├── TapOrder.sol
│   │   ├── PriceFeedAdapter.sol
│   │   ├── PayoutPool.sol
│   │   └── mocks/MockV3Aggregator.sol
│   ├── test/                       ← Foundry tests
│   ├── scripts/                    ← deploy.ts, fund-pool.ts
│   ├── typechain-types/            ← auto-generated TypeChain bindings
│   └── package.json
├── fe/                             ← Next.js frontend (to be scaffolded)
│   ├── package.json
│   └── src/
│       └── app/
│           ├── (auth)/             ← login screen
│           ├── (trading)/          ← main trade screen
│           ├── (history)/           ← trade history
│           └── (wallet)/           ← balance & wallet
└── packages/
    └── shared/                     ← shared TypeScript types, ABIs (stub, not yet used)
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

See `be/src/entities/` for actual TypeORM entity definitions.

```sql
-- Core tables (as implemented)

users (
  user_address    VARCHAR(42) PRIMARY KEY,  -- EOA wallet address
  privy_user_id   VARCHAR(42),              -- Privy user ID (nullable)
  wallet_address  VARCHAR(42),               -- derived EOA (nullable)
  balance_wei    NUMERIC(78,0) DEFAULT 0,
  total_deposited_wei  NUMERIC(78,0) DEFAULT 0,
  total_withdrawn_wei NUMERIC(78,0) DEFAULT 0,
  is_banned      BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
)

orders (
  id              UUID PRIMARY KEY,          -- TypeORM generated
  user_address    VARCHAR(42) NOT NULL,     -- EOA wallet
  order_id_on_contract BIGINT NOT NULL,     -- contract's orderId
  asset          VARCHAR(20) NOT NULL,      -- 'BTC/USD'
  target_price   BIGINT NOT NULL,          -- stored as bigint
  is_above       BOOLEAN NOT NULL,
  duration       INTEGER NOT NULL,          -- seconds
  multiplier_bps INTEGER NOT NULL,          -- 500 = 5x payout
  stake_wei      NUMERIC(78,0) NOT NULL,
  status         VARCHAR(10) DEFAULT 'open', -- open|won|lost
  expiry_timestamp BIGINT NOT NULL,
  settled_at     TIMESTAMPTZ,
  settled_by     VARCHAR(42),
  payout_wei     NUMERIC(78,0),
  created_at     TIMESTAMPTZ DEFAULT NOW()
)

settlements (
  id              UUID PRIMARY KEY,
  order_id        UUID REFERENCES orders(id) UNIQUE,
  settled_by      VARCHAR(42) NOT NULL,
  payout_wei      NUMERIC(78,0) NOT NULL,
  fee_wei         NUMERIC(78,0) DEFAULT 0,
  settled_at      TIMESTAMPTZ NOT NULL
)

payments (
  id              UUID PRIMARY KEY,
  user_address    VARCHAR(42) NOT NULL,
  type            VARCHAR(20) NOT NULL,    -- deposit|withdrawal
  status          VARCHAR(20) DEFAULT 'pending', -- pending|completed|failed
  amount_wei      NUMERIC(78,0) NOT NULL,
  tx_hash         VARCHAR(66),
  completed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
)
```

---

## Environment Variables Reference

```bash
# be/.env
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

# fe/.env.local
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
