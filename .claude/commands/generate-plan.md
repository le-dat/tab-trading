# Command: generate-plan

## Description
Read CLAUDE.md + docs/spec-doc.md of the current project,
then generate a step-by-step implementation plan according to the exact stack and domain.

## Usage
```
/generate-plan
/generate-plan --phase backend
/generate-plan --milestone 1
```

## What Claude must do when receiving this command

### Step 1 — Read context
```
1. Read CLAUDE.md  → get: stack, domain logic, module map, env vars
2. Read docs/spec-doc.md → get: target milestone, features to build
3. Read docs/architecture.md → get: system design constraints & risks
4. Read .claude/commands/ & .claude/agents/ → get: existing automations
5. Scan current directory structure → get: what's already implemented vs. placeholder
```

### Step 2 — Analyze and classify the project
Determine which project type to choose the appropriate phase template:

| Type | Indicators | Phase template |
|------|------------|----------------|
| Web3 / Blockchain | Has smart contract, EVM, Chainlink | Setup → Contracts → Backend → Frontend → Deploy |
| Web2 SaaS | Has Supabase/MongoDB, Stripe, Auth | Setup → DB schema → API → Frontend → Billing → Deploy |
| AI Product | Has Anthropic/OpenAI API, embeddings | Setup → Data pipeline → API → UI → Evals → Deploy |
| Mobile | React Native / Flutter | Setup → Backend API → App screens → Push notif → Store |
| Internal Tool | Admin dashboard, CRUD | Setup → DB → API → Dashboard → Auth → Deploy |

### Step 3 — Generate the plan

For each phase, Claude must:
- Name the phase clearly (Phase 1 — Smart Contracts)
- Estimate time based on the scope in spec-doc
- List specific steps with actual commands (not abstract)
- **GAP ANALYSIS**: Check if existing commands/agents cover the complexity of this phase.
- **RECOMMENDATION**: If a phase is high-risk or repetitive (e.g., complex deployment, security audit), suggest creating a new Agent or Command.
- Attach the appropriate slash command to each step if one exists
- Clearly state dependencies: which step must be done before which

### Step 4 — Output format

Claude generates output in 2 formats:

**Format 1 — Markdown** (save to docs/project-plan.md):
```markdown
# Project Plan — [Project name]
Generated: [date]
Target: Milestone [N] — [milestone name]

## 🛠 Automation Recommendations (New Agents/Commands)
> Based on project gaps, we recommend creating these first:
- [ ] Agent: `[name].md` — Reason: [why it's needed]
- [ ] Command: `/[name].md` — Reason: [why it's needed]

## Phase 1 — [Name] (~[X] days)
### Step 1: [Name]
- Command: /[command-name] (if available)
- Run: `[specific shell command]`
- Done when: [clear completion condition]
- Dependency: [which step must be done first]
...
```

**Format 2 — Checklist** (print to terminal for tracking):
```
[ ] Phase 0: Automation Scaffolding (Create recommended agents/commands)
[ ] Phase 1: Setup (~1 day)
  [ ] Step 1: Scaffold project structure
  [ ] Step 2: Fill in CLAUDE.md
  [ ] Step 3: Configure settings.json
[ ] Phase 2: [Name] (~X days)
  ...
```

### Step 5 — Save and notify
```
1. Save to: docs/project-plan.md
2. Update: docs/project-status.md — add line "Plan generated: [date]. New automations recommended."
3. Notify: "Plan saved. Start by creating recommended Agents/Commands or with: /[first-command]"
```

## Example output with Gap Analysis (for Tap Trading)

```markdown
# Project Plan — Tap Trading
Generated: 2026-03-31
Target: Milestone 1 — MVP

## 🛠 Automation Recommendations
- [ ] Agent: `settlement-monitor-agent.md` — Reason: Settlement is the highest risk area; need an agent to monitor latency and house PnL.
- [ ] Command: `/check-infra.md` — Reason: Project has 5+ infra services; need a one-click health check command for local dev.

## Phase 1 — Smart Contracts (~5 days)
### Step 5: Write TapOrder.sol + tests
- Command: /smart-contract-dev
- Done when: yarn hardhat test 100% pass
- Dependency: Step 4 done
### Step 6: Deploy to BASE Sepolia
- Command: /price-feed-check
- Run: yarn hardhat run scripts/deploy.ts --network base-sepolia
- Done when: Contract verified on Basescan

## Phase 2 — Backend (~10 days)
### Step 7: Start local infra
- Command: /dev-setup
- Done when: docker compose ps → all healthy
...
```

## Example output for another SaaS project (to show the generic nature)

```markdown
# Project Plan — [SaaS App]
Generated: [date]
Stack: Next.js + Supabase + Stripe + Clerk

## Phase 0 — Setup (~1 day)
### Step 1: Clone claude-starter, fill in CLAUDE.md
### Step 2: Write spec-doc.md, define Milestone 1

## Phase 1 — Database (~2 days)
### Step 3: Design Supabase schema
- Command: /new-feature db-schema
- Done when: All tables + RLS policies created

## Phase 2 — Backend API (~5 days)
### Step 4: Auth flow (Clerk webhook → Supabase user)
### Step 5: Core API routes for Milestone 1 features

## Phase 3 — Frontend (~7 days)
### Step 6: Layout + routing (App Router)
### Step 7: Core screens for Milestone 1

## Phase 4 — Billing (~2 days)
### Step 8: Stripe integration (checkout, webhook, portal)

## Phase 5 — Deploy (~1 day)
### Step 9: Vercel + Supabase production
```

## Rules when generating a plan

1. **No abstract steps** like "Implement feature X" — must have specific commands
2. **Multi-source Analysis**: Always cross-reference `spec-doc.md`, `architecture.md`, and the existing file tree.
3. **Proactive Automation**: Always check for missing Agents/Commands for high-risk phases.
4. **Attach slash command** to every step that has a corresponding command
5. **Realistic time estimates** — double it if this is a solo developer
6. **Clear dependencies** — don't leave the reader to guess the order
7. **Done-when is binary** — either pass/fail clearly, not vague
8. **Milestone scope** — if spec-doc has multiple milestones, only plan for the specified milestone
