---
name: get-update
description: "Fetch latest updates from upstream repo (moeru-ai/airi) into main, merge main into dev, resolve conflicts if any, and push to fork (lariod12/airi). Use when user says 'get update', 'sync upstream', 'pull upstream', or 'update from upstream'."
---

# Get Update — Fork Sync Workflow

Syncs upstream `moeru-ai/airi` into `main`, then merges `main` into `dev` (your working branch).

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Mirror of upstream — only receives updates from `moeru-ai/airi`, no direct edits |
| `lariod12/dev` | Your working branch — all your changes go here |

## Remote Setup

| Remote | URL | Purpose |
|--------|-----|---------|
| `origin` | `https://github.com/lariod12/airi.git` | Your fork (push here) |
| `upstream` | `https://github.com/moeru-ai/airi.git` | Original repo (pull updates) |

## Execution Steps

Run these steps **in order**. Stop and report to user if any step fails.

### Step 1: Pre-flight checks

```bash
git remote -v
```

- Confirm `origin` points to `lariod12/airi`
- Confirm `upstream` points to `moeru-ai/airi`
- If remotes are missing, set them up:
  ```bash
  git remote set-url origin https://github.com/lariod12/airi.git
  git remote add upstream https://github.com/moeru-ai/airi.git
  ```

### Step 2: Stash uncommitted changes (if any)

```bash
git stash --include-untracked
```

- Only stash if there are uncommitted changes
- Remember to pop stash after everything completes

### Step 3: Update main from upstream

```bash
git checkout main
git fetch upstream
git merge upstream/main
git push origin main
```

- `main` should always fast-forward from upstream (no local commits on main)
- If merge fails, something was committed to main directly — report to user

### Step 4: Check for divergence between main and dev

```bash
git log --oneline lariod12/dev..main | head -20
```

- If no output, `lariod12/dev` already has all upstream changes — skip to Step 7
- If output exists, show the user what commits are incoming from upstream

### Step 5: Merge main into dev

```bash
git checkout lariod12/dev
git merge main
```

- If merge succeeds cleanly, proceed to Step 6
- If merge has **conflicts**, follow the Conflict Resolution procedure below

### Step 6: Conflict Resolution (if needed)

1. List conflicted files:
   ```bash
   git diff --name-only --diff-filter=U
   ```

2. For each conflicted file:
   - Read the file to understand both sides of the conflict
   - Analyze `<<<<<<<`, `=======`, `>>>>>>>` markers
   - **Prefer keeping user's changes** (HEAD/ours on lariod12/dev) when they are intentional customizations
   - **Accept upstream changes** (from main) when they are bug fixes, dependency updates, or new features that don't conflict with user's work
   - If unclear, **ask the user** which side to keep

3. After resolving all conflicts:
   ```bash
   git add <resolved-files>
   git commit -m "merge: sync lariod12/dev with upstream moeru-ai/airi"
   ```

### Step 7: Push lariod12/dev to fork

```bash
git checkout lariod12/dev
git push origin lariod12/dev
```

### Step 8: Restore stashed changes (if stashed in Step 2)

```bash
git stash pop
```

- If stash pop causes conflicts, resolve them the same way as Step 6

### Step 9: Summary

Report to user:
- How many commits were pulled from upstream into main
- How many new commits were merged into lariod12/dev
- Whether any conflicts were resolved (and how)
- Confirmation that both branches are up to date
- Any stashed changes that were restored
- Current branch after completion (should be `lariod12/dev`)

## Quick Reference

```bash
# Full sync (no conflicts expected)
git checkout main && git fetch upstream && git merge upstream/main && git push origin main && git checkout lariod12/dev && git merge main && git push origin lariod12/dev

# Check if upstream has new commits
git fetch upstream && git log --oneline main..upstream/main
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `upstream` remote not found | `git remote add upstream https://github.com/moeru-ai/airi.git` |
| `origin` still points to moeru-ai | `git remote set-url origin https://github.com/lariod12/airi.git` |
| `lariod12/dev` branch doesn't exist | `git checkout -b lariod12/dev main && git push -u origin lariod12/dev` |
| Push rejected (non-fast-forward) | Merge first, then push |
| Stash pop conflict | Resolve manually, `git stash drop` after |
| Direct commits on main | Reset main to upstream: `git checkout main && git reset --hard upstream/main && git push --force origin main` (ask user first) |
