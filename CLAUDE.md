# MyChart Agent — Claude Code Instructions

## Project overview

AI agent that logs into Epic MyChart via browser automation, extracts health records as PDFs, and delivers merged PDF files ready to upload to Claude.ai. No APIs or FHIR — browser only.

Multi-provider support via `providers.json` (see `providers.example.json`). Each provider configures URL, credentials, and auth strategy.

## Key directories

- `src/extract/` — extraction pipeline: labs, visits, medications, messages (entry point: `index.ts`)
- `src/discover/` — portal navigation discovery engine, builds `nav-map.json` per provider
- `src/auth/` — composable auth system with strategy registries for login form and 2FA
- `src/browser/` — BrowserProvider abstraction (stagehand-local default, plain playwright fallback)
- `src/config.ts` — provider config schema (Zod)
- `output/` — runtime output (gitignored): PDFs, session.json, nav-map.json, probe screenshots

## Running

```bash
pnpm extract                          # Extract all records → output/<id>/labs-<id>.pdf etc.
pnpm extract --incremental            # Only fetch items newer than last run
pnpm typecheck                        # TypeScript type check (tsc --noEmit)
PROBE=1 pnpm extract                  # Probe mode: screenshot only, no PDFs
pnpm discover --provider <id>         # Discover portal nav structure → output/<id>/nav-map.json
FORCE_LABS=1 pnpm extract             # Force re-extract a section (FORCE_VISITS, FORCE_MEDS, FORCE_MSGS)
```

## Testing and linting

**No test suite.** Validate via `pnpm extract` against the live portal.
`pnpm lint` (ESLint + typescript-eslint). `pnpm typecheck` (tsc --noEmit).

## Key constraints

- **PDF-only output.** `page.pdf()` captures full page height and waits for async content.
- **Two browser providers.** `stagehand-local` (default, AI-powered) and `local` (plain Playwright). Set via `BROWSER_PROVIDER` env var.
- **Auth is composable.** Two axes: `loginForm` (two-step | single-page) and `twoFactor` (none | email | manual). Configured per provider in `providers.json`.
- **Nav-map drives navigation.** Discovery engine (`pnpm discover`) builds a nav-map.json. Extraction modules follow it instead of hardcoded act() instructions.
- **Session persistence.** Cookies in `output/<provider-id>/session.json` (12h TTL). Skips login + 2FA when valid.
- **2FA relay.** Watches `output/2fa.code` for manual OTP entry when Gmail auto-fetch fails.
- **Stagehand model bypass.** v2.5.8 whitelist is stale — use `AISdkClient` + Proxy. `@ai-sdk/anthropic` must be `@1.x`.

## Environment variables

See `.env.example`. Key: `ANTHROPIC_API_KEY`, `GMAIL_USER`/`GMAIL_APP_PASSWORD` (optional 2FA), `BROWSER_PROVIDER`, `PROBE`.

## Task tracking

Uses beads (`bd`). Run `bd ready` for next tasks. Include task ID in commits: `git commit -m "<msg> (<task-id>)"`.
Skills: /start-session, /end-session, /create-tasks, /build-tasks, /adr
