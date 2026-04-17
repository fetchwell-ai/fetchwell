# ADR-002: BrowserProvider abstraction for swappable browser backends

**Date:** 2026-04-14
**Status:** Accepted

## Context

The extraction pipeline needs to work with multiple browser backends:
- Local Chromium + Stagehand (development, single user)
- Browserbase cloud Chromium + Stagehand (no local browser required)
- Plain Playwright without AI (fallback, rarely used)

Without an abstraction, switching backends would require editing every extraction file (labs.ts, visits.ts, medications.ts, messages.ts, auth.ts).

## Decision

Define a `BrowserProvider` interface in `src/browser/interface.ts`. All browser operations (navigate, act, observe, pdf, session save/load) go through this interface. The concrete provider is selected at startup via the `BROWSER_PROVIDER` env var and injected into the extraction pipeline.

Three implementations:
- `stagehand-local` (default) — `src/browser/providers/stagehand-local.ts`
- `browserbase` — `src/browser/providers/stagehand-browserbase.ts`
- `local` — `src/browser/providers/playwright-local.ts`

## Consequences

- Extraction logic (labs.ts, visits.ts, etc.) is provider-agnostic — zero changes needed to add a new backend.
- Each provider implements the full interface, including `pdf()` and session methods.
- `BROWSER_PROVIDER` env var controls selection at runtime, no code change needed to switch.
- Provider implementations must stay in sync with the interface — adding a new method requires updating all three providers.
