# CLAUDE.md — Tap Trading Project Memory

> Update this file after each major feature or architectural decision.
> Claude reads this at the start of every session.

---

## 1. Project Overview

**Product:** Tap Trading — mobile-first gamified price-touch trading platform.

**Core mechanic:** User predicts whether a market price will touch a target level before expiry.

- Binary outcome: touch = **WIN** (Stake × Multiplier paid out automatically)
- No touch before expiry = **LOST** (stake gone)
- Settlement is automatic, on-chain, trustless — no manual intervention needed

**Target users:** Crypto-native mobile users who want fast, simple exposure to price movements without managing positions, stop-losses, or reading charts.

**References:**

- Concept: <https://www.tradesmarter.com/tap-trading.html>
- Codebase org: <https://github.com/tapl-chainlink> (backend + frontend + smart-contracts)

---

## 2. Repository Structure

```
tap-trading/                        ← monorepo root (yarn workspaces)
├── CLAUDE.md                       ← this file
├── .env.example
├── .claude/
│   ├── settings.json               ← permissions + MCP config
│   ├── commands/                   ← slash commands (10 files)
│   ├── agents/                     ← subagents
│   └── hooks/                      ← auto-lint, pre-bash-check, on-stop
├── docs/
│   ├── spec-doc.md                 ← what to build, milestones, acceptance criteria
│   ├── architecture.md             ← system design, DB schema, ADR log
│   ├── changelog.md                ← feature history
│   └── project-status.md          ← session tracking (read this to resume)
├── apps/
│   ├── contracts/                  ← Hardhat project
│   │   ├── contracts/
│   │   │   ├── TapOrder.sol        ← main trading contract
│   │   │   ├── PriceFeedAdapter.sol← Chainlink wrapper
│   │   │   ├── PayoutPool.sol      ← liquidity management
│   │   │   └── mocks/MockV3Aggregator.sol
│   │   ├── test/
│   │   ├── scripts/
│   │   └── typechain-types/        ← AUTO-GENERATED — do not edit manually
│   │
│   ├── backend/
│   │   └── src/
│   │       ├── adapters/           ← EVM contract adapters (TypeChain-based)
│   │       ├── config/             ← NestJS ConfigModule setup
│   │       ├── libs/               ← logger, redis, kafka shared libs
│   │       ├── migrations/         ← TypeORM migration files
│   │       └── modules/
│   │           ├── auth/           ← Privy JWT auth
│   │           ├── account/        ← user account management
│   │           ├── order/          ← order create/query/lifecycle
│   │           ├── settlement/     ← auto-settlement worker loop
│   │           ├── payment/        ← deposit/withdraw flows
│   │           ├── distribution/   ← payout distribution
│   │           ├── price/          ← Chainlink price ingestion → Redis → Kafka
│   │           ├── risk/           ← exposure checks, rate limits
│   │           ├── strategy/       ← multiplier pricing logic
│   │           ├── socket/         ← Socket.io gateway (realtime)
│   │           └── worker/         ← background jobs + event listeners
│   │
│   └── frontend/
│       └── app/
│           ├── (auth)/             ← login screen
│           ├── (trading)/          ← main trade screen
│           ├── (history)/          ← trade history
│           └── (wallet)/           ← balance & wallet
│
└── packages/
    └── shared/                     ← shared TypeScript types, ABIs, constants, utils
```

---

## 3. Core Business Logic — READ THIS CAREFULLY

### 3.1 Trade flow (end-to-end)

```
1. User opens app → sees live BTC/USD price from Chainlink
2. User sees TargetBlockGrid: blocks at ±0.5%, ±1%, ±2% from current price
3. User taps a block → selects duration (1m / 5m / 15m) → enters stake
4. App shows: "Potential payout = stake × multiplier" before confirmation
5. User taps TRADE → tx sent to TapOrder contract on BASE
6. Settlement worker monitors Chainlink price feed every 100ms via Redis cache
7a. Price touches target before expiry:
    → contract.settleOrder() called → PayoutPool transfers payout to user wallet
    → Kafka: order.won → Socket.io push → WIN animation on frontend
7b. Expiry reached without touch:
    → contract.expireOrder() called → status = LOST
    → Kafka: order.lost → Socket.io push → LOSE animation on frontend
```

### 3.2 Multiplier pricing — MVP fixed tiers

```
Target Distance | Multiplier Offered | House Edge (approx)
±0.5%           | 2x                 | ~20%
±1.0%           | 5x                 | ~14%
±2.0%           | 10x                | ~17%

Formula:
  Fair multiplier  = 1 / P(touch)         ← based on historical BTC volatility
  Platform offer   = Fair × (1 - 0.15)    ← 15% house edge buffer
```

> ⚠ House edge MUST stay positive at all times. Monitor house PnL daily.
> Dynamic pricing based on real-time volatility is a Milestone 2 feature.

### 3.3 Settlement rules (critical — must be exact)

```
WIN condition:  currentPrice >= targetPrice  (if isAbove = true)
                currentPrice <= targetPrice  (if isAbove = false)
LOST condition: block.timestamp >= order.expiry AND price never touched

Edge cases that MUST be handled:
- Price touches exactly AT target → WIN (inclusive check)
- Price gaps through target (e.g. jump from $64900 to $65100, target $65000) → WIN
- settleOrder called twice → must be idempotent (revert on second call)
- Chainlink price stale > 60s → reject new orders, do NOT settle
- PayoutPool insufficient liquidity → settlement tx reverts, retry with backoff
```

### 3.4 Risk controls

```
Per-trade limits:
  Max stake per trade: 0.1 ETH (configurable per asset)
  Min stake per trade: 0.001 ETH

Per-user limits:
  Max concurrent OPEN orders: 5
  Max daily loss (stake total): 1 ETH
  Frequency limit: 1 order per 10 seconds

Platform limits:
  Max total exposure per asset: 10 ETH (= PayoutPool balance × 0.5)
  If exposure exceeded: reject new orders for that asset
```

---

## 4. Smart Contract Architecture

### Key contracts

```
TapOrder.sol
  createOrder(asset, targetPrice, isAbove, duration, multiplierBps)
    → payable — user sends ETH as stake
    → validates: asset whitelisted, multiplier valid, pool has liquidity
    → emits: OrderCreated(orderId, user, asset, targetPrice, stake, expiry)

  settleOrder(orderId)
    → permissionless — anyone can call (trustless)
    → reads price from PriceFeedAdapter
    → if WIN: PayoutPool.payout(user, stake × multiplierBps / 10000)
    → emits: OrderWon(orderId, user, payout) or OrderLost(orderId, user)

  batchSettle(uint256[] orderIds)
    → gas-efficient bulk call for worker

  pause() / unpause()
    → owner only — emergency stop

PriceFeedAdapter.sol
  getLatestPrice(asset) → (int256 price, uint256 updatedAt)
    → wraps Chainlink AggregatorV3Interface
    → REVERTS if age > STALE_THRESHOLD
    → REVERTS if price <= 0

PayoutPool.sol
  deposit(asset) payable         ← fund the pool
  payout(user, amount)           ← only TapOrder can call
  getBalance(asset) → uint256
```

### TypeChain workflow

```bash
# After ANY contract change:
cd apps/contracts
yarn hardhat compile
yarn typechain:gen
# Then update: apps/backend/src/adapters/ to use new bindings
```

---

## 5. Backend Module Map

| Module       | HTTP/Role         | Key deps                                | Publishes to Kafka    |
| ------------ | ----------------- | --------------------------------------- | --------------------- |
| auth         | REST /auth/\*     | Privy SDK, JWT, Redis                   | —                     |
| account      | REST /account/\*  | PostgreSQL                              | —                     |
| order        | REST /orders/\*   | PostgreSQL, risk, strategy, EVM adapter | order.created         |
| settlement   | Worker job        | Redis, EVM adapter                      | order.won, order.lost |
| payment      | REST /payments/\* | EVM adapter, PostgreSQL                 | payment.processed     |
| distribution | Kafka consumer    | PostgreSQL, EVM adapter                 | —                     |
| price        | Worker listener   | Ethers.js WS, Redis                     | price.updated         |
| risk         | Internal service  | Redis, PostgreSQL                       | —                     |
| strategy     | Internal service  | price service, config                   | —                     |
| socket       | Socket.io :3001   | Redis pub/sub, Kafka                    | —                     |
| worker       | Standalone :3002  | All above modules                       | —                     |

### NestJS module pattern (always follow this)

```typescript
@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity])],
  controllers: [OrderController],
  providers: [OrderService, OrderRepository],
  exports: [OrderService],
})
export class OrderModule {}
```

### EVM adapter pattern

```typescript
@Injectable()
export class TapOrderAdapter {
  private contract: TapOrder;

  constructor(private config: ConfigService) {
    const provider = new ethers.JsonRpcProvider(config.get("RPC"));
    const wallet = new ethers.Wallet(config.get("ADMIN_PRIVATE_KEY"), provider);
    this.contract = TapOrder__factory.connect(config.get("CONTRACT_TAP_ORDER"), wallet);
  }

  async createOrder(params: CreateOrderParams): Promise<ethers.TransactionReceipt> {
    const tx = await this.contract.createOrder(
      params.asset,
      params.targetPrice,
      params.isAbove,
      params.duration,
      params.multiplierBps,
      { value: params.stakeWei },
    );
    return tx.wait();
  }
}
```

### Price cache pattern (Redis)

```typescript
// Writer (price module worker):
await redis.set(`price:${asset}`, JSON.stringify({ value: price, updatedAt: Date.now() }));

// Reader (settlement worker, every 100ms):
const raw = await redis.get(`price:${asset}`);
const { value, updatedAt } = JSON.parse(raw);
if (Date.now() - updatedAt > 60_000) throw new StalePriceError(asset);
```

### Socket push pattern

```typescript
// From settlement worker via Kafka → Socket gateway:
this.server.to(`user:${userId}`).emit("order:won", { orderId, payout });
this.server.to(`user:${userId}`).emit("order:lost", { orderId });
```

---

## 6. Environment Variables

```bash
# apps/backend/.env
NODE_ENV=development
PORT=3001
WORKER_PORT=3002
NETWORK=testnet                        # testnet | mainnet

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

JWT_SECRET=your-jwt-secret-min-32-chars
PRIVY_APP_ID=your-privy-app-id
PRIVY_APP_SECRET=your-privy-secret

FEED_BTC_USD=0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298   # BASE Sepolia
FEED_ETH_USD=0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1   # BASE Sepolia

# apps/frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
NEXT_PUBLIC_CHAIN_ID=84532                                  # BASE Sepolia
NEXT_PUBLIC_TAP_ORDER_ADDRESS=0x...
```

---

## 7. Coding Patterns & Conventions

### Commit convention

```
feat: add settlement worker retry logic
fix: handle stale price edge case in settleOrder
chore: update TypeChain bindings after contract change
test: add idempotency test for double-settle
docs: update architecture.md with new module
```

### TypeScript rules

- `strict: true` — no `any`, no implicit returns
- All DTOs use `class-validator` decorators
- All entities use TypeORM decorators, never raw SQL except migrations
- All service methods return typed promises, never `Promise<any>`

### Error handling pattern

```typescript
// Custom exceptions — always extend HttpException
export class StalePriceException extends BadRequestException {
  constructor(asset: string) {
    super(`Price feed for ${asset} is stale. Trading temporarily paused.`);
  }
}
export class InsufficientLiquidityException extends ServiceUnavailableException { ... }
export class RiskLimitExceededException extends ForbiddenException { ... }
```

### Testing pattern (Vitest)

```typescript
describe("OrderService", () => {
  it("rejects order when user exceeds max concurrent limit");
  it("rejects order when asset exposure limit reached");
  it("calls contract.createOrder with correct params");
  it("publishes order.created to Kafka after DB save");
  it("throws NotFoundException for unknown orderId");
});
```

### Frontend hook pattern

```typescript
export function usePrice(asset: string) {
  const [price, setPrice] = useState<bigint>(0n);
  useEffect(() => {
    socket.on(`price:${asset}`, ({ value }) => setPrice(BigInt(value)));
    return () => {
      socket.off(`price:${asset}`);
    };
  }, [asset]);
  return price;
}
```

---

## 8. Testing Strategy

```
Unit tests:        Vitest — every service has *.spec.ts
Integration tests: Vitest — full module with real Postgres (testcontainers)
E2E tests:         Vitest — full API flow via HTTP
Contract tests:    Hardhat — every contract function + edge cases

MUST cover in contract tests:
  ✓ settleOrder: price touches exactly at target (inclusive)
  ✓ settleOrder: price gaps through target
  ✓ settleOrder: called twice → idempotent (reverts)
  ✓ settleOrder: stale Chainlink feed → reverts
  ✓ createOrder: pool has insufficient liquidity → reverts
  ✓ createOrder: asset not whitelisted → reverts
  ✓ pause(): no new orders accepted while paused
  ✓ batchSettle: partial failures don't block whole batch

Run before any commit:
  yarn test           ← all workspaces
  yarn type-check     ← TypeScript strict
  yarn lint           ← ESLint
```

---

## 9. Security Checklist

Run through this before any mainnet deploy or major release.

### Smart contracts

- [ ] Reentrancy guard on `createOrder` and `settleOrder` (`nonReentrant`)
- [ ] Stale price check: reject if `updatedAt > 60s` ago
- [ ] Integer overflow: Solidity 0.8+ handles this, but verify multiplier math
- [ ] Access control: only TapOrder can call `PayoutPool.payout()`
- [ ] Pausable: `pause()` / `unpause()` works correctly
- [ ] No hardcoded addresses in contract logic (use constructor params)
- [ ] Verify on Basescan after deploy

### Backend

- [ ] JWT secret is min 32 chars, rotated on breach
- [ ] Rate limiting: per-IP and per-wallet (NestJS ThrottlerModule)
- [ ] All DTOs validated with `class-validator` before hitting service
- [ ] Kafka consumer idempotent: check orderId before processing
- [ ] ADMIN_PRIVATE_KEY never logged, never returned in API response
- [ ] Settlement worker: retry with exponential backoff on tx failure

### Frontend

- [ ] No private keys in `localStorage` or `sessionStorage`
- [ ] Privy handles all key management — never access raw wallet
- [ ] API calls use HTTPS in production
- [ ] CSP headers configured in `next.config.js`
- [ ] No `.env.local` secrets committed to git

---

## 10. Constraints & Rules (non-negotiable)

1. **Never** push directly to `main` — always feature branch + PR
2. **Never** commit `.env` or `.env.local` files
3. **Never** use `synchronize: true` in TypeORM DataSource (production data loss risk)
4. **Never** delete migration files — always roll forward
5. **Always** run `yarn typechain:gen` after any contract ABI change
6. **Always** create a migration after changing any TypeORM entity
7. **Always** update `docs/changelog.md` after completing a feature (`/update-docs`)
8. **Always** update `docs/project-status.md` at end of session (`/retro`)
9. Settlement logic changes require a second pair of eyes (or explicit test coverage) before merge
10. PayoutPool must be funded before any orders can be placed — check balance before deploy

---

## 11. Available Slash Commands

| Command                  | When to use                                              |
| ------------------------ | -------------------------------------------------------- |
| `/new-feature [name]`    | Start any new feature (plans before coding)              |
| `/commit`                | Create a well-formatted git commit                       |
| `/pr`                    | Create a GitHub Pull Request                             |
| `/update-docs`           | Update changelog + architecture after completing feature |
| `/retro`                 | End-of-session summary + update project-status.md        |
| `/backend-module [name]` | Scaffold a new NestJS module with full boilerplate       |
| `/settlement-debug`      | Debug when orders are not settling correctly             |
| `/price-feed-check`      | Verify Chainlink feeds are live and fresh                |
| `/deploy`                | Deploy contracts + backend + frontend to production      |
| `/dev-setup`             | Start local dev environment from scratch                 |

---

## 12. Known Issues & Architectural Decisions

| #   | Decision / Issue                    | Resolution                                                                           | Date |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------ | ---- |
| 1   | Fixed vs dynamic multiplier for MVP | Fixed tiers — simpler to audit house edge correctness                                | —    |
| 2   | Which testnet                       | BASE Sepolia — has Chainlink feeds + lowest gas                                      | —    |
| 3   | Auth approach                       | Privy embedded wallet — web2 UX without losing self-custody                          | —    |
| 4   | Settlement trigger                  | Worker polls Redis every 100ms (not on-chain event) — lower latency                  | —    |
| 5   | Settlement permissions              | Permissionless (anyone can call settleOrder) — trustless, no single point of failure | —    |
| 6   | Price source                        | Chainlink only — manipulation-resistant, users can verify on-chain                   | —    |
| 7   | Kafka vs direct DB events           | Kafka — decouples settlement from order creation, replay on crash                    | —    |
