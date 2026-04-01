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

**Phase:** 2 — Infrastructure (🔄 IN PROGRESS)
**Week:** 3
**Overall progress:** 25% (See [Detailed Plan](project-plan.md) for steps)

---

## Last Session

**Date:** 2026-03-31 (third session)
**Duration:** ~30 min
**Completed:**
- Created `docker-compose.yml` with Postgres (:5434), Redis (:6380), Kafka (:29093), Zookeeper, MinIO — all running and healthy
- Removed `Makefile` — using CLI commands directly (`docker compose`, `yarn`, `forge`)
- Created `docker.env` + `docker.env.example` credential templates (gitignored)
- Replaced generic `.env.example` with Tap Trading-specific vars aligned to Docker ports
- Replaced root `package.json` — no workspaces (each package manages its own deps)
- Created `be/` NestJS scaffold: `main.ts`, `app.module.ts`, `data-source.ts`, `Order` entity
- Updated `.gitignore` to exclude `docker.env` and Docker volume dirs

---

## Next Session — Start Here

**Goal:** Finish Phase 2 Infrastructure — complete Docker setup + run migrations

**Plan:** [project-plan.md](project-plan.md) — Phase 2 🔄 in progress

**First command to run:**
```bash
cd be && docker compose -f docker-compose.yml --env-file docker.env ps
```

**Exact prompt to give Claude:**
```
Finish Phase 2: Infrastructure.
1. Run `cd be && docker compose -f docker-compose.yml --env-file docker.env up -d` to start infra
2. Run `cd be && yarn install` (and `cd smc && yarn install` if needed)
3. Create remaining TypeORM entities (User, Settlement, Payment)
4. Run `cd be && yarn migration:up` to apply migrations
5. Then scaffold the NestJS modules: auth, order, price, settlement, socket
```

**Files to touch next:**
- `be/src/entities/` (add User, Settlement, Payment entities)
- `be/src/modules/` (scaffold NestJS modules)
- `docker-compose.yml` — Kafka healthcheck fix (nc command may not be available in container)

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
| Docker Compose infra | 🔄 done | Postgres :5434, Redis :6380, Kafka :29093, MinIO :9002/:9003 — all healthy |
| Makefile | ❌ removed | CLI-only approach — docker compose + yarn + forge directly |
| NestJS backend scaffold | 🔄 in progress | `main.ts`, `app.module.ts`, `data-source.ts`, `Order` entity exist |
| TypeORM migrations | ⬜ not started | Phase 2 |
| BASE Sepolia deploy | ⬜ not started | Phase 5 |
| Backend: auth | ⬜ not started | Phase 3 |
| Backend: price | ⬜ not started | Phase 3 |
| Backend: order | ⬜ not started | Phase 3 |
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
