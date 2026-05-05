# ADR 005: Session Verification Uses Saved Home URL, Not Login URL

**Date:** 2026-05-04  
**Status:** Accepted

## Context

The extraction pipeline saves browser cookies to `output/session.json` after a successful login so subsequent runs can skip login and 2FA. To verify a saved session is still alive, the code needs to navigate somewhere and check whether it ends up on an auth page or the authenticated app.

The initial implementation computed a "home URL" by stripping `/Authentication/Login?` from `MYCHART_URL`:

```
https://ucsfmychart.ucsfmedicalcenter.org/ucsfmychart/  ← computed
```

This caused a redirect to `?action=logout` on every probe run, forcing a re-login and re-2FA each time.

A second attempt used `MYCHART_URL` (the login page URL) directly for verification. This also caused logout — MyChart treats navigation to the login URL while authenticated as an explicit logout signal.

## Decision

After a successful login, capture the actual post-login URL (`browser.url()`) and save it as `homeUrl` in `session.json`. Use this URL — not the login URL or any computed variant — for all subsequent session verification and section navigation.

```typescript
// In SerializedSession:
homeUrl?: string;

// After login:
const session = await browser.saveSession();
session.homeUrl = await browser.url();  // e.g. /UCSFMyChart/Home/
saveSession(session);

// In ensureLoggedIn():
const homeUrl = loadSavedSession()?.homeUrl;
if (homeUrl) await browser.navigate(homeUrl);
```

## Consequences

- Session verification and section-to-section navigation now use a URL that's safe to navigate to while authenticated.
- The `homeUrl` is provider-specific and captured at runtime, so it works correctly for both UCSF and future providers regardless of their URL casing or structure.
- Sessions without a saved `homeUrl` (from before this fix) fall back to skipping the navigation check — they will attempt to use whatever page they're already on.
- The login URL (`MYCHART_URL`) must only be used for the initial navigation to the login form, never for session verification.
