# FetchWell — Claude Code Instructions

## Project overview

AI agent that logs into health portals (e.g. Epic MyChart) via browser automation, extracts health records as PDFs, and delivers merged PDF files ready to upload to Claude.ai. No APIs or FHIR — browser only.

Two entry points: **CLI** (`pnpm extract`) and **Electron desktop app** (`pnpm electron:dev`). Both share the same extraction/discovery pipeline.

Multi-provider support via `providers.json` (see `providers.example.json`). Each provider configures URL, credentials, and auth strategy.

## Key directories

- `src/extract/` — extraction pipeline: labs, visits, medications, messages (entry: `index.ts`, runner: `runner.ts`)
- `src/discover/` — agentic portal discovery engine using browser.act() + browser.extract(), builds `nav-map.json` per provider
- `src/auth/` — composable auth system with strategy registries for login form and 2FA
- `src/browser/` — BrowserProvider abstraction (stagehand-local default, plain playwright fallback)
- `src/renderer/` — React UI for the Electron app (Vite-built, Tailwind CSS v4, shadcn/ui, Framer Motion, dark mode)
- `src/config.ts` — provider config schema (Zod)
- `src/electron-runner.ts` — subprocess entry point spawned by the Electron pipeline bridge
- `electron/` — Electron main process: window management, IPC handlers, config/credential storage, pipeline bridge
- `tests/unit/` — vitest unit tests for logic modules
- `tests/e2e/` — Playwright Electron E2E tests
- `output/` — runtime output (gitignored): PDFs, session.json, nav-map.json

## Running

```bash
# CLI mode
pnpm extract                          # Extract all records → output/<id>/
pnpm extract --incremental            # Only fetch items newer than last run
pnpm discover --provider <id>         # Debug tool: discover portal nav structure → nav-map.json
PROBE=1 pnpm extract                  # Probe mode: screenshot only, no PDFs

# Binary (equivalent to pnpm extract; enables global install via npm install -g)
mychart-agent fetch                   # Extract all records → output/<id>/
mychart-agent fetch --provider <id>   # Extract for a specific provider
mychart-agent fetch --incremental     # Only fetch items newer than last run

# Electron app
pnpm electron:dev                     # Build renderer + electron, launch app
pnpm dist                             # Build macOS DMG via electron-builder → release/

# Checks
pnpm typecheck                        # TypeScript check (src/)
npx tsc -p electron/tsconfig.json --noEmit  # TypeScript check (electron/)
pnpm lint                             # ESLint (src/)
```

## Testing

```bash
pnpm test:unit                        # Vitest — 119 unit tests, <1s
pnpm test:e2e                         # Playwright Electron — 16 tests, ~15s
```

E2E tests launch the Electron app via Playwright and cover portal CRUD, settings, and the pipeline integration chain.

- **NEVER run `ucsf-discovery.spec.ts` or `integration.spec.ts`** unless the user explicitly asks. UCSF requires email 2FA that will fail and risk locking out the account.
- **Use Stanford portal** (no 2FA) for all portal testing.
- Electron app steals window focus during E2E tests — avoid launching during automated builds.
- **Default to `pnpm test:unit` and `pnpm typecheck` only.** No E2E tests that launch the Electron app unless explicitly requested.
- **Stanford E2E test:** `E2E_STANFORD=1 npx playwright test tests/e2e/stanford-e2e.spec.ts` — full pipeline test: add Stanford portal → extract. Requires `ANTHROPIC_API_KEY` in `.env` and Stanford creds in `providers.json`. Takes ~2-4 min, steals focus. Skipped unless `E2E_STANFORD=1`.

## Key constraints

- **PDF-only output.** `page.pdf()` captures full page height and waits for async content.
- **Two browser providers.** `stagehand-local` (default, AI-powered) and `local` (plain Playwright). Set via `BROWSER_PROVIDER` env var.
- **Auth is composable.** Two axes: `loginForm` (auto | two-step | single-page) and `twoFactor` (none | email | manual | ui). Login form type is auto-detected at runtime by default; detected value is cached for future runs.
- **Nav-map is a cache, not a contract.** Agentic discovery builds nav-map.json with cached URLs and act() instructions. Extraction uses a 3-tier fallback: cached URL → replay steps → fresh agentic search. Discovery is not a required user-facing step — extraction discovers on-the-fly if no nav-map exists.
- **Session persistence.** Cookies in `output/<provider-id>/session.json` (12h TTL). Skips login + 2FA when valid.
- **Electron ↔ Pipeline bridge.** Electron forks `src/electron-runner.ts` as a subprocess (ESM via tsx). IPC for progress events, 2FA relay, and error reporting. One operation per portal at a time.
- **Three TypeScript configs.** `tsconfig.json` (src/, ESM), `electron/tsconfig.json` (electron/, CJS), `src/renderer/tsconfig.json` (renderer/, Vite/bundler).
- **CJS fix for Electron.** `dist-electron/package.json` with `{"type":"commonjs"}` is generated at build time (root package.json is `"type": "module"`).
- **Dark mode.** System preference matching + manual Light/Dark/System toggle. Uses Tailwind `dark:` variant with class-based toggling via `nativeTheme`.
- **Structured progress events.** Subprocess sends typed IPC events (`src/progress-events.ts`). ProgressPanel renders progress bar, category rows, and status messages. Noisy Stagehand warnings are filtered from the detailed log.

## Environment variables

See `.env.example`. Key: `ANTHROPIC_API_KEY`, `GMAIL_USER`/`GMAIL_APP_PASSWORD` (email 2FA), `BROWSER_PROVIDER`, `PROBE`.

## Task tracking

Uses beads (`bd`). Run `bd ready` for next tasks. Include task ID in commits: `git commit -m "<msg> (<task-id>)"`.
Skills: /start-session, /end-session, /create-tasks, /build-tasks, /adr
