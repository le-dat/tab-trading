# Command: new-feature

## Description
Start a new feature for the Tap Trading platform following the correct PSB workflow.
Overrides new-feature.md from claude-starter to add Tap Trading-specific context.

## Workflow

### Step 1: Research & Plan (BEFORE CODING)
```
1. Re-read the relevant CLAUDE.md section (business logic, module map)
2. Answer 3 questions:
   a. Does this feature affect the settlement flow?
      → If YES: review settlement-debug.md, add idempotency check
   b. Does this feature change the order lifecycle?
      → If YES: update risk module, add new Kafka event
   c. Does this feature require a contract change?
      → If YES: start from smc/, generate new TypeChain first
3. Create a GitHub Issue before coding:
   gh issue create --title "feat: [feature name]" --body "[description + acceptance criteria]"
```

### Step 2: Setup branch
```bash
git checkout develop
git pull origin develop
git checkout -b feat/issue-{NUMBER}-{feature-name}
```

### Step 3: Implement in the correct order

**If there is a contract change:**
```
smc/ → test → typechain:gen → be/adapters/ → module → frontend
```

**If backend change only:**
```
module entity → migration → service → controller → kafka events → tests
```

**If frontend change only:**
```
hook → component → store → integration test
```

> ⚠ ALWAYS implement backend first, then frontend.
> ⚠ ALWAYS write tests before creating a PR.

### Step 4: Tap Trading-specific checks before committing
```
[ ] If adding a field to Order entity → run migration:generate
[ ] If adding a new Kafka topic → update onchain-events.md
[ ] If changing multiplier logic → update docs/architecture.md Risk section
[ ] If changing settlement condition → test with edge case: price touches EXACTLY at target
[ ] If adding a new asset → add Chainlink feed address to price-feed-check.md
[ ] If changing contract ABI → run yarn typechain:gen and update adapter
```

### Step 5: Commit & PR
```bash
# Use /commit command (from claude-starter)
/commit

# Create PR
/pr

# PR description must include:
# - Link to GitHub Issue
# - Settlement impact (if any)
# - Contract change (if any) + Basescan link
# - Test coverage summary
```

### Step 6: Update docs
```bash
# Use /update-docs command (from claude-starter)
/update-docs
```

## Feature size guide

| Size | Example | Approach |
|------|---------|----------|
| Small | Add a field to an API response | 1 branch, implement directly |
| Medium | Add a new asset (SOL/USD) | 1 branch, follow order: contract → backend → frontend |
| Large | Add Early Close feature | Split into multiple issues, multi-agent worktree |

## Common features and special notes

### Adding a new asset
```
1. Get Chainlink feed address from docs.chain.link/data-feeds (BASE network)
2. Add to price-feed-check.md
3. Add to FEEDS config in PriceWorker
4. Add STALE_THRESHOLDS for the new asset
5. Test: run the price-feed-check command to verify the feed works
```

### Adding a new duration (e.g., 30 minutes)
```
1. Add to DURATIONS constant in packages/shared
2. Update multiplier pricing in StrategyService (longer time → higher P(touch) → lower multiplier)
3. Update frontend DurationPills component
4. Test: create an order with the new duration, verify expiry is correct
```

### Adding a new multiplier tier
```
1. Update StrategyService.calculateMultiplier()
2. Verify house edge is still positive after adding the new tier
3. Update frontend TargetBlockGrid to display the new tier
4. Run backtest with historical price data if possible
```
