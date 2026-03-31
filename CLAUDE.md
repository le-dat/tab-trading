# CLAUDE.md — Tap Trading Project Memory

> [ [Spec](docs/spec-doc.md) ] [ [Architecture](docs/architecture.md) ] [ [Plan](docs/project-plan.md) ] [ [Status](docs/project-status.md) ] [ [Changelog](docs/changelog.md) ]

> Claude reads this at the start of every session for core rules and tech stack.

---

## 1. Project Overview

**Product:** Tap Trading — mobile-first gamified price-touch trading platform.
**Core mechanic:** User predicts price touch before expiry. Binary outcome (WIN/LOST).
**Links:** [Detailed Specification](docs/spec-doc.md) | [System Architecture](docs/architecture.md)

---

## 2. Repository Structure

```
│           ├── (trading)/          ← main trade screen
│           ├── (history)/          ← trade history
│           └── (wallet)/           ← balance & wallet
│
└── packages/
    └── shared/                     ← shared TypeScript types, ABIs, constants, utils
```

---

## 3. Core Logic & Settlement

Detailed in [Project Specification](docs/spec-doc.md).

- **WIN:** `currentPrice >= targetPrice` (if Above) or `<= targetPrice` (if Below).
- **LOST:** Expiry reached without touch.
- **Settlement:** Automatic & permissionless via `settleOrder(orderId)`.
- **Stale Feeds:** Reject/Stop if price age > 60s.
- **Risk:** Max 0.1 ETH/trade, 5 concurrent orders/user.

---

## 4. System Architecture

Detailed in [Architecture Design](docs/architecture.md).

### Core Coding Patterns (Mandatory)

**TypeChain Workflow:**

1. `cd apps/contracts && forge build && yarn compile && yarn typechain:gen`
2. Update `apps/backend/src/adapters/` with new bindings.

**NestJS Module Pattern:**

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

## 8. Testing & Quality

Detailed criteria in [Acceptance Criteria](docs/spec-doc.md#5-acceptance-criteria--definition-of-done).

**Essential Commands:**

- `yarn foundry:test` — Contract tests (Foundry)
- `yarn test` — Backend/Frontend tests (Vitest)
- `yarn lint && yarn type-check` — Static analysis

---

## 9. Security & Safety

Full checklist in [Architecture (Security)](docs/architecture.md).

- **Reentrancy:** Always use `nonReentrant` on fund-handling functions.
- **Price Freshness:** Never settle if `block.timestamp - updatedAt > 60s`.
- **Admin Keys:** Never log or leak `ADMIN_PRIVATE_KEY`.
- **Liquidity:** Check PayoutPool balance before deploying/executing.

---

## 10. Constraints & Rules (non-negotiable)

1. **Never** push directly to `main` — always feature branch + PR
2. **Never** commit `.env` or `.env.local` files
3. **Never** use `synchronize: true` in TypeORM DataSource (production data loss risk)
4. **Never** delete migration files — always roll forward
5. **Always** run `yarn typechain:gen` after any contract ABI change
6. **Always** create a migration after changing any TypeORM entity
7. **Always** use `/checkpoint` after completing a feature or ending a work session to sync documentation (changelog, project status, and project plan).
8. **Always** update `docs/project-plan.md` via `/checkpoint` to track progress.
9. Settlement logic changes require a second pair of eyes (or explicit test coverage) before merge
10. PayoutPool must be funded before any orders can be placed — check balance before deploy

---

## 11. Available Slash Commands

| Command | When to use |
| :--- | :--- |
| `/new-feature [name]` | Start any new feature (plans before coding) |
| `/commit` | Create a well-formatted git commit |
| `/pr` | Create a GitHub Pull Request |
| `/checkpoint` | Unified sync: update changelog + status + plan progress |
| `/backend-module [name]` | Scaffold a new NestJS module with full boilerplate |
| `/settlement-debug` | Debug when orders are not settling correctly |
| `/price-feed-check` | Verify Chainlink feeds are live and fresh |
| `/deploy` | Deploy contracts + backend + frontend to production |
| `/dev-setup` | Start local dev environment from scratch |

---

## 12. Known Issues & Architectural Decisions

| --- | ----------------------------------- | ------------------------------------------------------------------------------------ | ---- |
| 1   | Fixed vs dynamic multiplier for MVP | Fixed tiers — simpler to audit house edge correctness                                | —    |
| 2   | Which testnet                       | BASE Sepolia — has Chainlink feeds + lowest gas                                      | —    |
| 3   | Auth approach                       | Privy embedded wallet — web2 UX without losing self-custody                          | —    |
| 4   | Settlement trigger                  | Worker polls Redis every 100ms (not on-chain event) — lower latency                  | —    |
| 5   | Settlement permissions              | Permissionless (anyone can call settleOrder) — trustless, no single point of failure | —    |
| 6   | Price source                        | Chainlink only — manipulation-resistant, users can verify on-chain                   | —    |
| 7   | Kafka vs direct DB events           | Kafka — decouples settlement from order creation, replay on crash                    | —    |
