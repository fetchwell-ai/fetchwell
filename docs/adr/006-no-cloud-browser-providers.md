# ADR 006: No Cloud Browser Providers — Local-Only Execution

**Date:** 2026-05-04  
**Status:** Accepted

## Context

The extraction pipeline logs into health portals (MyChart) using real patient credentials and navigates pages containing protected health information (PHI) — lab results, visit notes, medications, and provider messages.

An earlier implementation included a Browserbase cloud provider (`src/browser/providers/browserbase.ts`) that ran the browser session on Browserbase's remote infrastructure. This meant PHI transited through and was rendered on third-party servers, creating compliance and privacy risk even if Browserbase doesn't persist page content.

## Decision

Remove the Browserbase cloud provider entirely. All browser sessions run locally on the user's machine via Playwright/Chromium. The `BrowserProvider` abstraction remains — new providers are welcome, but they must execute locally.

## Consequences

- PHI never leaves the user's machine during extraction. No third-party infrastructure sees credentials or health data.
- The `BROWSER_PROVIDER` env var accepts `stagehand-local` (default) or `local`. The `browserbase` option no longer exists.
- Users cannot run extractions on headless cloud CI or remote machines without setting up their own local browser environment.
- If a cloud provider is needed in the future, it must be self-hosted infrastructure under the user's control, not a third-party SaaS.
