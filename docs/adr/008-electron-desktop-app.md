# ADR-008: Electron desktop app for public distribution

**Date:** 2026-05-07
**Status:** Accepted

## Context

The extraction pipeline works well as a CLI tool, but the target audience for public distribution — people who want their health records as PDFs — is not comfortable with git, Node.js, or terminal commands. Three distribution strategies were evaluated:

1. **Chrome extension** — Lowest friction install, but Chrome's extension sandbox severely limits Playwright/Stagehand (no spawning browser contexts, no `page.pdf()`). Would require rewriting the entire automation layer for Chrome DevTools Protocol within extension constraints. Also subject to Chrome Web Store review policies that could block health-data-touching extensions.

2. **Web portal (SaaS)** — Best UX, but the server would see user credentials and health data. This creates HIPAA exposure and requires trust infrastructure (SOC 2, BAAs) that is disproportionate to the project's scope. Users shouldn't have to trust a third party with their medical credentials.

3. **Electron desktop app** — Bundles Playwright + Chromium locally. All data stays on the user's machine. User provides their own Anthropic API key, so even LLM API calls go directly from their device to Anthropic. No server component, no HIPAA exposure. Larger download (~350MB) but installs like any Mac app.

## Decision

Ship as an Electron desktop app called "Health Record Fetcher". The existing `src/` extraction and discovery pipeline runs in Electron's main process (full Node.js environment). A React renderer provides the GUI. Credentials are encrypted via Electron `safeStorage` (macOS Keychain). The user provides their own Anthropic API key.

Key design choices:
- Discovery and extraction are separate user-visible operations (discover maps the portal, extract pulls records).
- Extract is disabled until discovery has run at least once for a portal.
- Browser is hidden by default; user can toggle visibility in settings.
- Transparency is the core UX principle — the app explains what it's doing, what data the AI sees, and what is stored where.
- MVP is macOS only. Windows deferred (different signing, Playwright paths).

## Consequences

- The existing pipeline code needs thin adapter layers (env-bridge, IPC logging, UI-based 2FA) but no fundamental rewrites.
- The project gains a significant new surface area: Electron shell, React UI, IPC layer, credential management, app signing/notarization.
- Distribution via DMG + GitHub Releases with electron-updater for auto-updates.
- The app name "Health Record Fetcher" is portal-agnostic — supports future non-MyChart portals.
- Users must obtain and pay for their own Anthropic API key, which is a friction point but eliminates all data-handling liability.
