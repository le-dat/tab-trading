# Changelog — Tap Trading

> [ [CLAUDE.md](../CLAUDE.md) ] [ [Spec](spec-doc.md) ] [ [Architecture](architecture.md) ] [ [Plan](project-plan.md) ] [ [Status](project-status.md) ] [ [Changelog](changelog.md) ]

> Updated automatically by `/update-docs` command after each completed feature.
> Format: [version or date] — what changed — who / which session.

---

## How to update

After completing a feature, run:
```
/checkpoint
```
Claude will add an entry to this file with: what was built, key decisions made, any bugs encountered and fixed.

---

## Unreleased — In Progress

### Added
- Project scaffolded from claude-starter template
- CLAUDE.md populated with full Tap Trading domain context
- docs/ folder initialized with spec-doc, architecture, changelog, project-status
- project-plan.md generated (22 steps, 6 phases, ~8 weeks to Milestone 1)
- `PayoutPool.sol`: added `ReentrancyGuard` + `nonReentrant` on `withdraw()`
- `PriceFeedAdapter.sol`: added `Ownable` + `onlyOwner` on `setFeed()`
- `TapOrder.sol`: added `MIN_STAKE` (0.001 ETH) / `MAX_STAKE` (0.1 ETH) stake guards
- `TapOrder.sol`: `pause()`/`unpause()` now coordinate with `PayoutPool.pause()`/`unpause()`
- `scripts/deploy.ts`: grants `DEFAULT_ADMIN_ROLE` to TapOrder for PayoutPool pause coordination

### Fixed
- `@nomicfoundation/hardhat-toolbox` missing dep → replaced with `@nomicfoundation/hardhat-ethers` to avoid Hardhat 3 migration chain
- Stale feed test arithmetic underflow (timestamp warp needed before updating mock)
- Missing `batchSettle` external call via `try this.settleOrder()` for partial failure isolation
- `deploy.ts`: missing `DEFAULT_ADMIN_ROLE` grant to TapOrder (needed for PayoutPool pause coordination)

---

## [0.1.0] — Contracts (target: Week 2)

_Phase 1 complete — 2026-03-31_

### Added
- TapOrder.sol: createOrder, settleOrder, batchSettle, pause/unpause, nonReentrant guards
- PriceFeedAdapter.sol: Chainlink AggregatorV3 wrapper with 60s stale threshold
- PayoutPool.sol: liquidity management, PAYOUT_ROLE access control
- MockV3Aggregator.sol: for local testing with `updateAnswerAndTimestamp`
- **23 Foundry tests**: all settlement edge cases, fuzz tests, batch settle, pause/unpause
- Deploy scripts: base-sepolia, base mainnet (in scripts/deploy.ts)
- TypeChain bindings generated (62 typings via `yarn typechain:gen`)

### Fixed
- Missing `@nomicfoundation/hardhat-ethers` devDependency
- Stale feed test needed `vm.warp` before `updateAnswerAndTimestamp` to avoid arithmetic underflow
- batchSettle uses `try this.settleOrder()` external call pattern for per-order failure isolation

### Decisions
- multiplierBps in basis points (500 = 5x) for integer math on-chain
- settleOrder is permissionless (anyone can call) → trustless settlement, no single point of failure
- batchSettle swallows individual settle failures so one bad order doesn't block the batch

---

## [0.2.0] — Backend Core (target: Week 5)

_To be filled after Phase 2 completion._

### Added
- NestJS monorepo setup: API (:3001) + Worker (:3002)
- auth module: Privy verify → JWT issue
- price module: Chainlink event listener → Redis cache → Kafka publish
- order module: create/query with risk validation
- settlement module: worker loop, price touch detection, on-chain settle
- socket module: Socket.io gateway, realtime order status push
- Docker Compose: postgres, redis, kafka, minio, zookeeper

---

## [0.3.0] — Frontend MVP (target: Week 8)

_To be filled after Phase 3 completion._

### Added
- Next.js 14 App Router setup
- Privy embedded wallet integration
- AssetSelector with live price ticker
- TargetBlockGrid: 6 blocks (±0.5%, ±1%, ±2%)
- TapButton with haptic feedback
- ActiveTradeCard: countdown ring + price proximity bar
- WinModal / LoseModal with Framer Motion animations
- Trade history page
- PWA manifest + service worker

---

## [0.4.0] — Pre-launch (target: Week 10)

_To be filled after Phase 4 completion._

### Added
- Security review: reentrancy, stale price, rate limiting
- Load test: 100 concurrent orders
- BASE Mainnet deploy
- Post-launch monitoring setup
