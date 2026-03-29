# Tap Trading — Project Specification

> Phase 1 document. Complete this before writing any code.
> Claude reads this file to understand what to build.

---

## Project Goal

Build a mobile-first gamified trading platform where users predict whether a market price will touch a target level before expiry. Binary outcome: touch = WIN (Stake × Multiplier), no touch = LOST (stake gone). Settlement is automatic, on-chain, trustless.

**Target users:** Crypto-native mobile users who want fast, simple exposure to price movements without managing positions, stop-losses, or charts.

**Core problem solved:** Traditional trading is complex and intimidating. Tap Trading removes all order mechanics — one tap, one question: "will price touch this level?"

---

## Milestone 1 — MVP (Weeks 1–8)

### Must have

- [ ] 1 asset: BTC/USD via Chainlink on BASE Sepolia
- [ ] 3 durations: 1 minute, 5 minutes, 15 minutes
- [ ] Fixed multiplier tiers: 2x / 5x / 10x (tied to target distance)
- [ ] Target price blocks: ±0.5%, ±1%, ±2% from current price
- [ ] One-tap trade entry with stake input
- [ ] Automatic settlement: win if price touches target before expiry
- [ ] Payout: Stake × Multiplier transferred to user wallet on win
- [ ] Wallet connect via Privy (email/social login + embedded wallet)
- [ ] Active trade monitor: countdown timer + price proximity indicator
- [ ] Win/lose animation feedback
- [ ] Trade history page

### Out of scope for Milestone 1

- Multiple assets
- Dynamic multiplier calculation
- Early close / cashout
- Leaderboard / social features
- Mobile native app (PWA only)

---

## Milestone 2 — Beta (Weeks 9–14)

- [ ] Add assets: ETH/USD, XAU/USD (Gold)
- [ ] Dynamic multiplier based on volatility + distance + duration
- [ ] More durations: 30m, 1h, 4h
- [ ] Leaderboard (weekly top traders)
- [ ] Referral system
- [ ] Push notifications (PWA)
- [ ] Admin dashboard: exposure monitor, house PnL, pause controls

---

## Milestone 3 — Production (Weeks 15+)

- [ ] BASE Mainnet deploy
- [ ] External security audit
- [ ] Mobile app (React Native)
- [ ] More assets: SOL/USD, EUR/USD, Oil
- [ ] Early close feature
- [ ] Multiple languages

---

## Core Mechanic — How It Works

```
1. User opens app → sees BTC/USD current price (live from Chainlink)
2. User sees a grid of target price blocks above and below current price
   - Block at +1% from current → 5x multiplier
   - Block at +2% from current → 10x multiplier
   - Block at +0.5% from current → 2x multiplier
3. User taps a block → selects duration (1m / 5m / 15m)
4. User enters stake amount (e.g. 0.01 ETH)
5. App shows: "Potential payout: 0.05 ETH" (0.01 × 5x)
6. User taps "TRADE" → transaction sent to TapOrder contract
7. Settlement worker monitors Chainlink price feed continuously
8. IF price touches or crosses target before expiry:
   → Contract auto-settles → sends 0.05 ETH to user wallet
   → App shows WIN animation
9. IF expiry reached without touch:
   → Contract marks order LOST
   → App shows LOSE animation
```

---

## Multiplier Pricing Logic (MVP — fixed tiers)

For Milestone 1, use fixed tiers. Dynamic pricing in Milestone 2.

| Target Distance | Multiplier Offered | Fair Multiplier\* | House Edge |
| --------------- | ------------------ | ----------------- | ---------- |
| ±0.5%           | 2x                 | 2.5x              | ~20%       |
| ±1.0%           | 5x                 | 5.8x              | ~14%       |
| ±2.0%           | 10x                | 12x               | ~17%       |

\*Fair multiplier estimated from BTC historical 15-min volatility.
House edge covers losses when multiple users win simultaneously.

---

## Tech Stack

| Layer             | Technology                            |
| ----------------- | ------------------------------------- |
| Smart contracts   | Solidity 0.8.20, Hardhat, TypeChain   |
| Oracle            | Chainlink AggregatorV3 on BASE        |
| Chain             | BASE (Sepolia testnet → Mainnet)      |
| Backend API       | NestJS, TypeScript                    |
| Background worker | NestJS standalone app                 |
| Database          | PostgreSQL + TypeORM                  |
| Cache             | Redis                                 |
| Event bus         | Kafka                                 |
| File storage      | MinIO                                 |
| Auth              | Privy (embedded wallet)               |
| Realtime          | Socket.io                             |
| Frontend          | Next.js 14 (App Router), Tailwind CSS |
| State             | Zustand                               |
| Animations        | Framer Motion                         |
| Web3 hooks        | Wagmi + Viem                          |
| Container         | Docker + Docker Compose               |
| CI/CD             | GitHub Actions                        |
| Hosting           | VPS (backend) + Vercel (frontend)     |

---

## Acceptance Criteria — Definition of Done

A feature is "done" when:

1. Unit tests pass (Vitest)
2. Integration test covers the happy path
3. No TypeScript errors (`yarn type-check`)
4. No lint errors (`yarn lint`)
5. Migration created and applied (if schema change)
6. Changelog updated (`/update-docs`)
7. For contract changes: tests pass + TypeChain regenerated

Settlement specifically is "done" when:

- Price touch at exact target price settles correctly (edge case)
- Price crossing target (gap) settles correctly
- Expiry with no touch marks LOST correctly
- Calling settleOrder twice is idempotent (no double payout)
- Stale Chainlink feed (>60s) rejects new orders

---

## Risk & Constraints

**Biggest technical risk:** Settlement latency. If the worker misses a touch event or lags > 5s, user trust is destroyed. Mitigation: Redis price cache updated every Chainlink event, worker polls every 100ms.

**Biggest business risk:** House edge miscalculation. If multipliers are too generous, the pool gets drained. Mitigation: Fixed tiers in MVP, conservative estimates, monitor house PnL daily.

**Regulatory note:** This is a prediction market / gaming product. Consult legal counsel before launch in regulated jurisdictions.
