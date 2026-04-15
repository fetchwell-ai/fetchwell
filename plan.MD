# MyChart Agent — Plan

**Last updated:** 2026-04-14

---

## Overall Plan

| Phase | Goal |
|---|---|
| **Phase 0** | Core extraction: authenticate (incl. 2FA), extract labs, visits, medications, messages as PDFs |
| **Phase 1** | Refactor + stabilize: proper `src/` structure, PDF-only output, reliability fixes |
| **Phase 2** | Cloud browser: run extraction via Browserbase, no local browser required |
| **Phase 3** | Multi-user web UI, guided setup, secure per-user credentials |

---

## Current Status — 2026-04-14

**Phase 1 complete.** All four record sections extract and merge correctly via local Stagehand.

| Milestone | Status |
|---|---|
| Refactor `spike/` → `src/` module structure | ✅ Done |
| PDF output migration — all four sections | ✅ Done |
| `labs.pdf` validated (36 panels, 4.5 MB, incl. imaging reports) | ✅ Done |
| `visits.pdf` validated (12 document links, 1,014 KB) | ✅ Done |
| `medications.pdf` validated (46 KB) | ✅ Done |
| `messages.pdf` validated (28 threads, 7,106 KB) | ✅ Done |
| Session persistence (12h TTL, cookie restore) | ✅ Done |
| Gmail auto-2FA via IMAP | ✅ Done |
| `navigateWithRetry` for message thread reliability | ✅ Done |
| Remove HTML/JSON/zip output, `pnpm chat`, `pnpm package` | ✅ Done |

**Phase 2 not started.** `src/browser/providers/stagehand-browserbase.ts` is stubbed but needs three fixes before it works end-to-end.

---

## What Remains

### 1. Phase 2 — Browserbase cloud browser (next priority)

`src/browser/providers/stagehand-browserbase.ts` needs three fixes:

**a. Model setup** — Replace `modelName: "claude-sonnet-4-6"` + `modelClientOptions` with the `AISdkClient` + Proxy pattern from `stagehand-local.ts`. The current approach hits Stagehand's model whitelist.

**b. `pdf()` method** — Not implemented. Add:
```typescript
async pdf(): Promise<Buffer> {
  return this.stagehand.page.pdf({ format: "A4", printBackground: true });
}
```

**c. Session methods** — `saveSession()` and `loadSession()` not implemented. Copy from `stagehand-local.ts` (same implementation: `page.context().cookies()`).

After those three fixes: add `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` to `.env`, set `BROWSER_PROVIDER=browserbase`, run `pnpm extract`, and validate all four PDFs are produced with correct content.

> Note: Browserbase has infrastructure-level access to all rendered pages. Review their data handling policy before using for health records.

### 2. Phase 1.4 — Proper CLI entry point (deferred)

Replace `pnpm extract` with `mychart-agent fetch` as a proper CLI binary. Not blocking anything — `pnpm extract` is sufficient for single-user use.

### 3. Phase 3 — Multi-user web UI (future)

Web UI with guided setup and secure per-user credential handling. No design work started.

---

## Known Issues / Blockers

None blocking Phase 2.

- Session re-login per section is expected behavior: `ensureLoggedIn()` re-authenticates when the server-side session expires mid-run. Gmail auto-2FA handles re-logins transparently after the first login in a run.
