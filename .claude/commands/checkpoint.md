# Command: checkpoint

## Description

Unified command to update project documentation (changelog, status, plan) and summarize the current work session.

## When asked to run this command, Claude must:

### Step 1 — Analyze recent work

- Read `git log --oneline -n 10` or check current memory for changes made in the session.
- Identify all completed items, even if they are sub-tasks of a larger step.
- Identify:
  - ✅ **Completed items** (including "Grouped Tasks" — multiple related sub-tasks).
  - 🔄 **In-progress work**.
  - 🐛 **New bugs** or technical debt.
  - 💡 **Architectural decisions** made.

### Step 2 — Update Documentation (Unified & Grouped)

1. **`docs/changelog.md`**:
   - Add new entry at the top for current session.
   - **Group related tasks:** Instead of many redundant lines, group sub-tasks under a logical feature header.
   - Format: Date, Title, Added/Changed/Fixed lists.

2. **`docs/project-plan.md`**:
   - Find completed steps and mark them with `✅`.
   - **Handling Hierarchical Tasks (Grouped Tasks):** If a Step has an internal list (e.g., Step 8: Build Modules), mark only the specific sub-items that are done (e.g., `1. Auth ✅`).
   - If *all* sub-items within a step are complete, mark the main Step as `✅`.
   - Update status of in-progress or blocked steps.

3. **`docs/project-status.md`**:
   - Update **Current Phase** and **Overall progress %**.
   - Update **Last Session** with the date and **grouped** tasks summaries.
   - Update **Next Session — Start Here** with clear goals and starting prompts.
   - Refresh **Milestone Progress** tables.

4. **`CLAUDE.md` / `docs/architecture.md`** (Optional):
   - Update only if significant patterns or architectural changes were made.

### Step 3 — Maintenance (Optional)

- Suggest running `/commit` if there are untracked/modified files that should be saved.
- Prompt for GitHub issue creation if new bugs or ideas were found.

### Step 4 — Summary

- Summarize what was updated in the documentation.
- Provide a starting prompt or recommended command for the next session.
