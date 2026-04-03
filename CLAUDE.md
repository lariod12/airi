# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project Overview

Project AIRI is an LLM-powered virtual character platform — a "soul container" inspired by [Neuro-sama](https://www.youtube.com/@Neurosama). It creates a digital companion that can **talk** (TTS via ElevenLabs), **listen** (speech recognition via Whisper), **see** (with a 3D VRM or Live2D avatar with lipsync and auto-animation), **play games** (Minecraft, Factorio, Kerbal Space Program), and **chat** on platforms (Discord, Telegram). It's a pnpm monorepo (pnpm@10.32.1, Turborepo for builds) with Vue 3, TypeScript, Vite, and Electron at its core, delivering the same experience across desktop, web, and mobile.

## Workflow Architecture

```
User speaks/types
       │
       ▼
┌─────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Ears (STT) │───▶│   Brain (Core)   │───▶│  Mouth (TTS)    │
│  Web Audio  │    │  LLM via @xsai/* │    │  ElevenLabs     │
│  Whisper    │    │  Memory (DuckDB) │    │  + Lipsync      │
└─────────────┘    │  Tool calls      │    └────────┬────────┘
                   └───────┬──────────┘             │
                           │                        ▼
                    ┌──────▼──────┐         ┌───────────────┐
                    │  Actions    │         │  Body (Avatar) │
                    │  Minecraft  │         │  VRM / Live2D  │
                    │  Factorio   │         │  Auto-blink    │
                    │  Discord    │         │  Look-at       │
                    │  Telegram   │         │  Idle movement │
                    └─────────────┘         └───────────────┘
```

1. **Input (Ears)**: Mic audio → Web Audio API → client-side STT (Whisper) or server-side (unspeech) → text. Or direct text input.
2. **Processing (Brain)**: Text → LLM provider (OpenAI, Claude, Gemini, etc. via `@xsai/*`) → Core orchestration (`packages/stage-ui/stores/modules/`) handles context, memory, and tool calls. Memory stored in DuckDB WASM (browser) or pgvector (server).
3. **Output (Mouth + Body)**: LLM response → TTS (ElevenLabs) → audio playback. Simultaneously, lipsync drives the VRM/Live2D model with synchronized mouth movement, auto-blink, gaze tracking, and idle animations.
4. **Actions**: LLM can invoke tools — play Minecraft (Mineflayer), Factorio (RCON API), send Discord/Telegram messages.
5. **Server (optional)**: `server-runtime` (Hono) enables bot services, game agents, plugin system, and multi-client connections. Apps run independently without it.

## Common Commands

```bash
# Install dependencies
pnpm install

# Dev servers
pnpm dev:web              # Web app (stage-web)
pnpm dev:tamagotchi       # Electron desktop app (stage-tamagotchi)
pnpm dev:server           # Server runtime
pnpm dev:ui               # Stage UI stories (Histoire)

# Build
pnpm build                # All packages + apps via Turborepo
pnpm build:packages       # Only packages
pnpm -F @proj-airi/stage-web build          # Single workspace
pnpm -F @proj-airi/stage-tamagotchi build   # Desktop app

# Typecheck
pnpm typecheck                              # All workspaces in parallel
pnpm -F @proj-airi/stage-tamagotchi typecheck  # Single workspace

# Lint
pnpm lint                 # Check all (uses moeru-lint / ESLint)
pnpm lint:fix             # Auto-fix (also handles formatting)

# Tests (Vitest)
pnpm test:run                                    # All projects
pnpm exec vitest run <path/to/file.test.ts>      # Single test file
pnpm -F @proj-airi/stage-ui exec vitest run      # Single workspace
```

## Architecture

### App Surfaces

Three app surfaces share UI and business logic from `packages/`:

- **`apps/stage-tamagotchi`** — Electron desktop app. Uses `electron-vite`. Main process in `src/main/`, renderer in `src/renderer/`. IPC contracts defined in `src/shared/` using `@moeru/eventa`.
- **`apps/stage-web`** — Vue 3 web app. Pages in `src/pages/`, composables in `src/composables/`.
- **`apps/stage-pocket`** — Mobile app via Capacitor (iOS/Android). Vue 3 + Vue Router.

### Shared Package Layer

- **`packages/stage-ui`** — Heart of the UI. Business components (`src/components/`), composables (`src/composables/`), Pinia stores (`src/stores/`), provider definitions (`src/stores/providers/`), orchestration modules (`src/stores/modules/`).
- **`packages/stage-ui-three`** — Three.js 3D rendering + Vue components (VRM models, scenes).
- **`packages/stage-shared`** — Shared logic consumed by stage-ui, stage-ui-three, and all app surfaces.
- **`packages/stage-pages`** — Shared page base components used by both web and desktop.
- **`packages/ui`** — Low-level UI primitives (inputs, buttons, layout) built on reka-ui. Minimal business logic.
- **`packages/i18n`** — All translations live here; don't scatter i18n across apps.

### Server Channel

- **`packages/server-runtime`** — Server entrypoint (Hono-based).
- **`packages/server-sdk`**, **`packages/server-sdk-shared`**, **`packages/server-shared`** — SDK and shared types for server communication.
- **`packages/server-schema`** — Schema definitions (Drizzle ORM).
- **`packages/plugin-sdk`**, **`packages/plugin-protocol`** — Plugin system for extending server capabilities.

### Services & Plugins

- **`services/`** — Standalone service integrations: `discord-bot`, `telegram-bot`, `minecraft`, `twitter-services`, `satori-bot`.
- **`plugins/`** — Server plugins: `airi-plugin-bilibili-laplace`, `airi-plugin-claude-code`, `airi-plugin-homeassistant`, `airi-plugin-web-extension`.

### Key Libraries & Patterns

- **DI**: `injeca` for dependency injection across services, electron modules, plugins, and frontend. See `apps/stage-tamagotchi/src/main/index.ts` for patterns.
- **IPC/RPC**: `@moeru/eventa` for type-safe, runtime-agnostic event contracts. Contracts defined centrally (e.g., `apps/stage-tamagotchi/src/shared/`).
- **Schema validation**: Valibot (keep schemas close to consumers).
- **AI/LLM**: `@xsai/*` packages for text generation, speech, embeddings, tool use.
- **Error handling**: Use `errorMessageFrom(error)` from `@moeru/std` instead of manual `instanceof Error` checks.
- **Styling**: UnoCSS (prefer over Tailwind). Config at root `uno.config.ts`. Use Vue `:class` arrays for readability.
- **Bundling new libs**: Use `tsdown` (see `packages/vite-plugin-warpdrive` for example).

### Vitest Test Projects

Root `vitest.config.ts` registers these projects: `apps/server`, `apps/stage-tamagotchi`, `packages/audio-pipelines-transcribe`, `packages/cap-vite`, `packages/plugin-sdk`, `packages/server-runtime`, `packages/server-sdk`, `packages/stage-shared`, `packages/stage-ui`, `packages/vite-plugin-warpdrive`.

### ESLint

Uses `@moeru/eslint-config` with TypeScript, Vue, and UnoCSS enabled. Import sorting via `perfectionist/sort-imports` with specific group ordering. `no-console` is an error (only `warn`, `error`, `info` allowed). Pre-commit hook runs `moeru-lint --fix` via `nano-staged`.

### Workspace Naming

All workspace package names use the `@proj-airi/` scope (e.g., `@proj-airi/stage-web`, `@proj-airi/stage-ui`). Use `-F @proj-airi/<name>` with pnpm to target a specific workspace.

## Fork Workflow

This repo is a fork of `moeru-ai/airi`. Two-branch strategy:

| Branch | Purpose |
|--------|---------|
| `main` | Mirror of upstream `moeru-ai/airi` — **never commit directly**, only receives upstream updates |
| `lariod12/dev` | Your working branch — **all your changes go here**, push to `origin lariod12/dev` |

| Remote | URL | Purpose |
|--------|-----|---------|
| `origin` | `https://github.com/lariod12/airi.git` | Your fork (push here) |
| `upstream` | `https://github.com/moeru-ai/airi.git` | Original repo (pull updates into main) |

- **Work on `lariod12/dev`** branch. All commits, features, fixes go to `lariod12/dev`.
- **Push your changes** to `origin lariod12/dev` (`git push origin lariod12/dev`)
- **Never commit directly to `main`** — it is a clean mirror of upstream
- Use `/get-update` skill to: sync upstream into main, merge main into lariod12/dev, resolve conflicts, push both
- When conflicts occur during merge, prefer keeping your intentional customizations on `lariod12/dev`

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **airi** (8873 symbols, 22581 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/airi/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/airi/context` | Codebase overview, check index freshness |
| `gitnexus://repo/airi/clusters` | All functional areas |
| `gitnexus://repo/airi/processes` | All execution flows |
| `gitnexus://repo/airi/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
