# Tap Trading — Project Status

> [ [CLAUDE.md](../CLAUDE.md) ] [ [Spec](spec-doc.md) ] [ [Architecture](architecture.md) ] [ [Plan](project-plan.md) ] [ [Status](project-status.md) ] [ [Changelog](changelog.md) ]

> Claude updates this file at the START and END of each session via `/checkpoint`.
> Use this to resume context quickly after closing terminal.

---

## How to use

**Start of session:** Tell Claude:
```
Read docs/project-status.md and continue from where we left off.
```

**End of session:** Run:
```
/checkpoint
```
Claude will update "Last session" and "Next session" sections below.

---

## Current Phase

**Phase:** 3 — Backend (🔄 IN PROGRESS)
**Week:** 4
**Overall progress:** 35% (See [Detailed Plan](project-plan.md) for steps)

---

## Last Session

**Date:** 2026-04-02 (fourth session)
**Duration:** ~15 min
**Completed:**
- Scaffolded 5 NestJS modules: auth, order, price, settlement, socket
- Created 4 TypeORM entities: User, Order, Settlement, Payment
- Generated `InitialSchema` migration file
- Updated `app.module.ts` to import all 5 modules
- Docker infra confirmed healthy (from previous session)

**Phase 2 status:** Infrastructure complete, migration entity scaffold done — awaiting `yarn migration:up`

---

## Next Session — Start Here

**Goal:** Finish Phase 3 Backend — implement NestJS module internals + EVM adapters

**Plan:** [project-plan.md](project-plan.md) — Phase 2 ✅ done, Phase 3 🔄 in progress

**First command to run:**
```bash
cd be && yarn dev
```

**Exact prompt to give Claude:**
```
Continue Phase 3 backend development.
1. Implement EVM adapters: TapOrderAdapter and PayoutPoolAdapter in be/src/adapters/
2. Implement the settlement worker (polling Redis every 100ms, calling settleOrder on-chain)
3. Implement the price ingestion worker (Chainlink WebSocket → Redis → Kafka)
4. Wire Socket.io gateway to push order:won/order:lost events to clients
5. Implement the auth module service (Privy JWT verification → JWT issue)
```

**Files to touch next:**
- `be/src/adapters/` (TapOrderAdapter, PayoutPoolAdapter)
- `be/src/modules/settlement/` (worker loop implementation)
- `be/src/modules/price/` (Chainlink ingestion)
- `be/src/modules/socket/` (Socket.io gateway)

---

## Milestone 1 Progress

| Feature | Status | Notes |
|---|---|---|
| Project scaffold | ✅ done | smc/be/fe packages, each with own package.json |
| TapOrder.sol | ✅ done | createOrder, settleOrder, batchSettle, pause/unpause, nonReentrant, stake limits |
| PriceFeedAdapter.sol | ✅ done | 60s stale threshold, Chainlink wrapper, Ownable |
| PayoutPool.sol | ✅ done | PAYOUT_ROLE access control, ReentrancyGuard, pause coordination |
| Contract tests | ✅ done | 57 Foundry tests passing (23 + 34 security tests) |
| TypeChain bindings | ✅ done | 62 typings via `yarn typechain:gen` |
| deploy.ts | ✅ done | Updated with DEFAULT_ADMIN_ROLE grant for pause coordination |
| Docker Compose infra | ✅ done | Postgres :5434, Redis :6380, Kafka :29093, MinIO :9002/:9003 — all healthy |
| Makefile | ❌ removed | CLI-only approach — docker compose + yarn + forge directly |
| NestJS backend scaffold | ✅ done | `main.ts`, `app.module.ts`, `data-source.ts`, all 5 modules scaffolded |
| TypeORM migrations | ✅ done | InitialSchema migration run; users, orders, settlements, payments tables created with indexes |
| BASE Sepolia deploy | ⬜ not started | Phase 5 |
| Backend: auth | 🔄 in progress | Phase 3 — auth + price + order controllers scaffolded; Swagger docs at /api/docs |
| Backend: price | 🔄 in progress | Phase 3 |
| Backend: order | 🔄 in progress | Phase 3 |
| Backend: settlement | ⬜ not started | Phase 3 |
| Backend: socket | ⬜ not started | Phase 3 |
| Frontend: auth screen | ⬜ not started | Phase 4 |
| Frontend: trading screen | ⬜ not started | Phase 4 |
| Frontend: win/lose UI | ⬜ not started | Phase 4 |
| E2E trade flow test | ⬜ not started | Phase 4 |
| Security review | ⬜ not started | Phase 5 |
| Mainnet deploy | ⬜ not started | Phase 5 |

Status key: ⬜ not started · 🔄 in progress · ✅ done · ❌ blocked

---

## Known Issues & Decisions Log

| # | Issue / Decision | Resolution | Date |
|---|---|---|---|
| 1 | Fixed vs dynamic multiplier for MVP | Fixed tiers — simpler to audit house edge | — |
| 2 | Which testnet? | BASE Sepolia — has Chainlink feeds + low gas | — |
| 3 | Auth approach | Privy embedded wallet — best web2 UX | — |
| 4 | Hardhat toolbox dependency hell | Use only `@nomicfoundation/hardhat-ethers` (not full toolbox) to avoid Hardhat 3 Ignition chain | 2026-03-31 |
| 5 | batchSettle failure isolation | `try this.settleOrder()` external call pattern — one bad order doesn't revert batch | 2026-03-31 |
| 6 | settleOrder is permissionless | Anyone can call — trustless settlement, no single point of failure | 2026-03-31 |
| 7 | Reentrancy attack surface | Added ReentrancyGuard to PayoutPool.withdraw(), Ownable on PriceFeedAdapter.setFeed() | 2026-03-31 |
| 8 | PayoutPool pause coordination | TapOrder.pause()/unpause() now call PayoutPool.pause()/unpause() to prevent orphaned settlement state | 2026-03-31 |
| 9 | Stake limits | MIN_STAKE 0.001 ETH / MAX_STAKE 0.1 ETH enforced in TapOrder.createOrder() | 2026-03-31 |

---

## Useful Context for Claude

- Admin wallet (ADMIN_PRIVATE_KEY) is used by backend to submit txs on behalf of users. Never expose to frontend.
- Settlement worker must be restarted if it crashes — add to docker compose restart: always.
- Chainlink feeds on BASE Sepolia update every ~20s. Don't assume more frequent.
- When testing settlement: use MockV3Aggregator to control price manually, don't wait for real market movements.
- PayoutPool needs to be funded BEFORE any orders can win. Test with: `scripts/fund-pool.ts`.
