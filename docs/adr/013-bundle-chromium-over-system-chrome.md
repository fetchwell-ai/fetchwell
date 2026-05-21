# ADR-013: Bundle Playwright Chromium over system Chrome or cloud browser

**Date:** 2026-05-21
**Status:** Accepted

## Context

FetchWell uses Stagehand (Playwright-based) to automate health portal navigation. The app needs a Chromium browser at runtime. Three options were evaluated: bundle Chromium in the DMG via `extraResources`, use the user's installed Chrome via Playwright's `channel: 'chrome'`, or use BrowserBase's cloud-hosted browser service.

## Decision

Bundle Playwright Chromium (~200MB) inside the app via electron-builder's `extraResources`. Pin `playwright` to the exact version matching the bundled Chromium revision (e.g., `1.59.1` for `chromium-1217`).

## Alternatives Considered

- **System Chrome (`channel: 'chrome'`)**: Playwright's `launchPersistentContext` with `channel: 'chrome'` has known bugs on macOS — opens blank pages and crashes (Playwright #19499). Conflicts with the user's already-running Chrome instance (#24144). No graceful handling of Chrome version mismatches. Nobody ships this pattern in production Electron apps.

- **BrowserBase cloud (`env: "BROWSERBASE"`)**: Technically straightforward — Stagehand already supports it. But health portal credentials (usernames, passwords) would transit BrowserBase's servers in memory during the session. HIPAA BAA is only available on the enterprise plan (custom pricing). `page.pdf()` support over CDP is undocumented. Latency adds 50-200ms per Playwright command. Recommended as a future hybrid option, not the default.

- **Download Chromium on first run**: Standard for Playwright CLI tools, but requires calling `npx playwright install` from a packaged Electron app — fragile since `npx` may not be on the user's PATH. No clean programmatic API for runtime browser installation.

## Consequences

- DMG is ~285MB (vs ~85MB without Chromium). Acceptable for a desktop app.
- Chromium revision must stay in sync: `extraResources` path (e.g., `chromium-1217`), `playwright` version pin, and `PLAYWRIGHT_BROWSERS_PATH` in `main.ts` must all agree.
- The headless shell binary (`chromium_headless_shell`) is NOT bundled — we pass `executablePath: chromium.executablePath()` in headless mode to force the full Chromium binary, saving ~70MB.
- BrowserBase cloud remains a viable future option for a hybrid mode (user chooses Local vs Cloud in settings). Would require a new `StagehandCloudProvider` (~200 lines) and a BrowserBase API key field in the settings UI.
