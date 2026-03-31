# Project Plan — Tap Trading

> [ [CLAUDE.md](../CLAUDE.md) ] [ [Spec](spec-doc.md) ] [ [Architecture](architecture.md) ] [ [Plan](project-plan.md) ] [ [Status](project-status.md) ] [ [Changelog](changelog.md) ]

Generated: 2026-03-31
Target: [Milestone 1 — MVP](spec-doc.md#milestone-1--mvp-weeks-18) (~8 weeks)

## 🛠 Automation Recommendations (New Agents/Commands)
> Based on project gaps, we recommend creating these first:

- [ ] **Agent: `settlement-monitor-agent.md`** — Reason: Settlement is the highest risk area per spec-doc; needs an agent to monitor latency and house PnL continuously.
- [ ] **Command: `/infra-health.md`** — Reason: Project has 5+ infra services (Postgres, Redis, Kafka, MinIO, EVM RPC); need a one-click health check command for local dev.

---

## Phase 0 — Automation Scaffolding (~1 day)
### Step 1: Create settlement-monitor-agent
- Agent template: smc-test-agent.md pattern
- Run: Write new agent to `.claude/agents/settlement-monitor-agent.md`
- Done when: Agent can monitor settlement latency and detect missed touches
- Dependency: None

### Step 2: Create infra-health command
- Command template: dev-setup.md pattern
- Run: Write new command to `.claude/commands/infra-health.md`
- Done when: `/<infra-health>` returns status of all 5 infra services
- Dependency: None

---

## Phase 1 — Smart Contracts (~5 days, ✅ COMPLETE)
> Status: All 23 tests passing. TypeChain bindings generated. Ready for BASE Sepolia deploy.

### Step 3: Complete TapOrder.sol Foundry tests
- Command: /smart-contract-dev
- Run: `cd apps/contracts && forge test`
- Done when: All settlement edge cases pass (inclusive touch, gap through, double-settle, stale feed, pause)
- Dependency: Contracts written (✅ done)

### Step 4: Add batchSettle to TapOrder + tests
- Run: Edit `TapOrder.sol` + `TapOrderTest.t.sol`
- Run: `forge test`
- Done when: batchSettle handles partial failures without blocking whole batch
- Dependency: Step 3

### Step 5: Verify TypeChain bindings are up to date
- Run: `cd apps/contracts && forge build && yarn compile && yarn typechain:gen`
- Done when: `apps/contracts/typechain-types/` contains fresh bindings for all 3 contracts
- Dependency: Step 3 + Step 4

---

## Phase 2 — Infrastructure (~3 days)
### Step 6: Set up Docker Compose for local dev
- Command: /dev-setup
- Run: `docker compose up -d` (after writing docker-compose.yml)
- Done when: `docker compose ps` shows Postgres ✅, Redis ✅, Kafka ✅, MinIO ✅
- Dependency: None

### Step 7: Create TypeORM migrations for core entities
- Run: `cd apps/backend && yarn migration:generate src/migrations/InitialSchema`
- Done when: Migration files created for users, orders, settlements, payments tables
- Dependency: Step 6

---

## Phase 3 — Backend (~14 days)

### Step 8: Scaffold NestJS modules via /backend-module
Repeat for each module in order:
1. `/backend-module auth` — Privy JWT auth (✅ done via commands)
2. `/backend-module account` — user account management
3. `/backend-module order` — order create/query/lifecycle
4. `/backend-module payment` — deposit/withdraw flows
5. `/backend-module risk` — exposure checks, rate limits
6. `/backend-module strategy` — multiplier pricing logic
7. `/backend-module price` — Chainlink price ingestion → Redis → Kafka
8. `/backend-module settlement` — auto-settlement worker loop
9. `/backend-module socket` — Socket.io gateway
10. `/backend-module distribution` — payout distribution

- Done when: All modules exist with controllers, services, repositories, DTOs, tests
- Dependency: Step 6 + Step 7

### Step 9: Implement EVM adapters (TapOrderAdapter, PayoutPoolAdapter)
- Run: Write adapters in `apps/backend/src/adapters/`
- Done when: `TapOrderAdapter.createOrder()` and `TapOrderAdapter.settleOrder()` work against BASE Sepolia
- Dependency: Step 5 (TypeChain bindings) + Step 8 (order module)

### Step 10: Implement price ingestion worker
- Run: Write `PriceWorkerService` using ethers.js WebSocket + Redis SET
- Done when: `redis.get("price:BTC-USD")` returns fresh price within 100ms of Chainlink update
- Dependency: Step 6 (Redis) + Step 8 (price module)

### Step 11: Implement settlement worker
- Run: Write `SettlementWorkerService` polling Redis every 100ms
- Done when: Open orders checked on every price update; settleOrder called correctly
- Dependency: Step 9 (adapters) + Step 10 (price worker)

### Step 12: End-to-end backend test
- Command: /backend-module (already scaffolded)
- Run: `yarn test` in apps/backend
- Done when: Integration tests pass for full create → settle flow
- Dependency: Step 8 + Step 9 + Step 10 + Step 11

---

## Phase 4 — Frontend (~10 days)

### Step 13: Scaffold Next.js app structure
- Run: `ls apps/frontend/app/` already has route groups (auth), (trading), (history), (wallet)
- Done when: `pages/` or `app/` routes exist for all 4 route groups
- Dependency: Step 6

### Step 14: Implement auth screen (Privy)
- Run: `apps/frontend/app/(auth)/`
- Done when: User can login via Privy (email/social) and get JWT
- Dependency: Step 8 (auth module)

### Step 15: Implement trading screen (main trade flow)
- Run: `apps/frontend/app.(trading)/`
- Components needed: PriceDisplay, TargetBlockGrid, DurationPicker, StakeInput, TradeButton, PayoutDisplay
- Done when: User sees live BTC/USD price, taps block → selects duration → enters stake → sees payout → confirms
- Dependency: Step 10 (price feed) + Step 11 (socket push)

### Step 16: Implement trade monitor (countdown + proximity)
- Run: Add timer + price proximity indicator to trading screen
- Done when: Active trade shows countdown timer; price proximity indicator shows distance to target
- Dependency: Step 15

### Step 17: Implement win/lose animations + trade history
- Run: `apps/frontend/app.(history)/` + Framer Motion animations
- Done when: WIN/LOSE animation plays on settlement; trade history page shows all past orders
- Dependency: Step 15 + Step 16

### Step 18: Implement wallet screen
- Run: `apps/frontend/app.(wallet)/`
- Done when: User can see balance, deposit (EOA → contract), withdraw
- Dependency: Step 8 (payment module)

---

## Phase 5 — Integration & Deploy (~5 days)

### Step 19: Connect frontend to backend API
- Run: Wire Next.js to NestJS REST API + Socket.io
- Done when: Trade button sends tx via contract adapter; order appears in history
- Dependency: Step 14 + Step 15

### Step 20: Deploy contracts to BASE Sepolia
- Command: /deploy
- Run: `yarn hardhat run scripts/deploy.ts --network base-sepolia`
- Done when: Contract verified on Basescan; PayoutPool funded
- Dependency: Step 3 + Step 4 + Step 5

### Step 21: Deploy backend to VPS
- Command: /deploy
- Run: Deploy NestJS API + Worker to VPS; set environment variables
- Done when: `https://api.taptrading.com/health` returns 200
- Dependency: Step 12

### Step 22: Deploy frontend to Vercel
- Run: `vercel deploy --prod`
- Done when: `https://taptrading.com` loads and connects to backend
- Dependency: Step 19 + Step 21

---

## Checklist Format

```
[ ] Phase 0: Automation Scaffolding (~1 day)
  [ ] Step 1: Create settlement-monitor-agent.md
  [ ] Step 2: Create infra-health.md command

[x] Phase 1: Smart Contracts (~5 days) ✅ COMPLETE
  [x] Step 3: Complete TapOrder Foundry tests (23 tests passing)
  [x] Step 4: Add batchSettle + tests
  [x] Step 5: Verify TypeChain bindings (62 typings generated)
  [x] Step 5b: Contract hardening — ReentrancyGuard, Ownable, stake limits, PayoutPool pause coordination (57 tests passing)

[ ] Phase 2: Infrastructure (~3 days)
  [ ] Step 6: Docker Compose setup
  [ ] Step 7: TypeORM migrations

[ ] Phase 3: Backend (~14 days)
  [ ] Step 8: Scaffold all 10 NestJS modules
  [ ] Step 9: EVM adapters
  [ ] Step 10: Price ingestion worker
  [ ] Step 11: Settlement worker
  [ ] Step 12: E2E backend tests

[ ] Phase 4: Frontend (~10 days)
  [ ] Step 13: Next.js app structure
  [ ] Step 14: Auth screen
  [ ] Step 15: Trading screen
  [ ] Step 16: Trade monitor
  [ ] Step 17: Win/lose animations + history
  [ ] Step 18: Wallet screen

[ ] Phase 5: Integration & Deploy (~5 days)
  [ ] Step 19: Frontend ↔ backend wiring
  [ ] Step 20: Deploy contracts to BASE Sepolia
  [ ] Step 21: Deploy backend to VPS
  [ ] Step 22: Deploy frontend to Vercel
```

---

## Notes

- **Time estimate**: 8 weeks for solo developer. Double if working concurrently on other projects.
- **Highest risk**: Settlement worker missing touch events → house drains. Mitigated by settlement-monitor-agent + 100ms polling.
- **First action**: Create recommended agents/commands (Phase 0) OR start with Step 3 (contracts) since those are partially done.
