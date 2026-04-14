# MyChart Browser Agent — Product & Engineering Document

**Version:** 0.5  
**Date:** 2026-04-13  
**Status:** PDF migration complete; visits/meds/messages PDF validation next, then Phase 2 (cloud deployment)

---

## 1. Overview

An AI agent that uses browser automation to log into Epic MyChart, navigate the patient portal, extract health records as PDF documents, and deliver merged PDFs ready for upload to Claude.ai.

No APIs or FHIR connectors — browser automation only.

---

## 2. Users

### v0 / Phase 1 (current)
- **Primary user:** A single technical user comfortable with CLI tools.
- **Interaction model:** `pnpm extract` to pull records → upload PDFs to Claude.ai to analyze.
- **2FA:** Fully automated via Gmail IMAP — no manual intervention required.

### Future (Phase 3+)
- Non-technical users via a web UI or guided CLI wizard.
- Multi-user support with secure per-user credential handling.

---

## 3. Goals by Phase

| Goal | Phase | Status |
|---|---|---|
| Authenticate into MyChart including 2FA | 0 | ✅ Done (Gmail auto-2FA) |
| Extract lab results as PDFs | 0 | ✅ Done (36 PDFs → labs.pdf, validated) |
| Extract visit notes | 0 | ✅ Done (PDF) |
| Extract imaging reports | 0 | ✅ Done (PDF, async content fixed) |
| Extract medication list | 0 | ✅ Done (PDF) |
| Extract messages / inbox | 0 | ✅ Done (28 threads, PDF) |
| Deliver records as merged PDFs for Claude.ai upload | 0 | ✅ Done |
| AI review: interactive chat about records | 0 | ⏸ Deprecated — use Claude.ai with exported PDFs instead |
| Refactor out of spike/ into proper application structure | 1 | ✅ Done (src/ at root) |
| Fix messages extraction reliability (network timeout) | 1 | ✅ Done (`navigateWithRetry` + per-thread resume) |
| PDF output migration (replace HTML/JSON/zip) | 1 | ✅ Done (labs validated; visits/meds/msgs need re-extraction) |
| Validate visits/meds/messages PDF output | 1 | ⬜ Next — run FORCE_VISITS=1 FORCE_MEDS=1 FORCE_MSGS=1 |
| Proper CLI entry point (`mychart-agent fetch`) | 1 | ⬜ Deferred |
| Cloud browser (Browserbase) | 2 | ⬜ Next after PDF validation |
| Multi-user web UI | 3 | ⬜ Future |

---

## 4. Record Types

| Priority | Record Type | Status |
|---|---|---|
| P0 | Lab results (blood work, metabolic panels) | ✅ Full HTML + structured JSON |
| P0 | Imaging reports (MRI, CT, X-ray, ECG) | ✅ Captured within lab HTML |
| P1 | Doctor/clinic visit notes | ✅ HTML + JSON |
| P2 | Medication lists | ✅ HTML |
| P2 | Messages / inbox threads | ✅ HTML + JSON (28 threads complete) |

---

## 5. User Journey (v0)

### 5.1 Extract Records
```bash
pnpm extract
```
The agent:
1. Restores saved session if < 12h old (skips login + 2FA)
2. If no session: logs in using credentials from `.env`, auto-fetches 2FA code from Gmail
3. Navigates to each section and extracts full page content as PDF documents
4. Builds `output/index.html` — a browsable local index of all records
5. Saves all records to `output/` (gitignored)

### 5.2 Browse Records
Open `output/index.html` in a browser. Click any document to view it with formatting.

### 5.3 Chat with Claude (deprecated)

> **Removed:** `src/chat.ts` deleted. Upload the 4 merged PDFs from `output/` to Claude.ai instead — it reads PDFs natively.

---

## 6. Authentication & Security

### Credentials
- Provided via `.env` file (`MYCHART_USERNAME`, `MYCHART_PASSWORD`)
- Never committed to git, never logged
- Held in memory only for the duration of the session

### Two-Factor Authentication
- **Auto-2FA:** Agent fetches verification code from Gmail IMAP using an App Password
- **Fallback:** File relay — `echo "123456" > output/2fa.code`
- **Standalone relay:** `pnpm tsx src/2fa-relay.ts` runs alongside the extraction pipeline as a separate process

### Session Persistence
- After successful login, cookies saved to `output/session.json` (12h TTL)
- Next run restores session — login and 2FA skipped entirely
- Delete `output/session.json` to force a fresh login

### Health Data Privacy
- All extracted records stay in `output/` — gitignored, never leave the local machine
- No health data written to logs or transmitted to third parties (beyond Anthropic API for chat)
- `output/session.json` contains only browser cookies, not health records

---

## 7. Output Format

### Current (PDF output)
```
output/
├── index.html              # Lists the 4 merged PDFs with links
├── labs.pdf                # All lab results + imaging reports merged — upload to Claude.ai
├── visits.pdf              # All visit notes merged — upload to Claude.ai
├── medications.pdf         # Medication list — upload to Claude.ai
├── messages.pdf            # All message threads merged — upload to Claude.ai
├── labs/                   # Individual lab PDFs (one per panel, used to build labs.pdf)
├── visits/                 # Individual visit PDFs
└── messages/               # Individual message thread PDFs
```

**PDF files:** Full page captured via Playwright `page.pdf()` after `waitForLoadState("networkidle")`. Captures full scroll height. Async-loaded content (imaging reports, etc.) is present. Upload directly to Claude.ai for analysis.

---

## 8. Error Handling

| Scenario | Behavior |
|---|---|
| Invalid credentials | Clear error message, exits |
| Session expired mid-run | `ensureLoggedIn()` detects and re-authenticates before each section |
| 2FA code not found in Gmail | Falls back to file-based relay (`output/2fa.code`) |
| Page structure changed | `observe()` returns 0 results, saves screenshot, continues to next section |
| Extraction schema failure | Saves HTML (never fails) + logs JSON extraction error |
| Network timeout during navigation | `navigateWithRetry()` retries once after 5s before propagating error |
| Network/browser failure | Error logged, browser kept open for inspection |

---

## 9. Technical Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript (Node.js 22+) | ESM throughout, `tsx` for dev |
| Package manager | pnpm | |
| Browser automation | Playwright (underlying) | |
| AI browser layer | Stagehand v2.5.8 + `AISdkClient` | Bypasses Stagehand's model whitelist |
| Claude model | `claude-sonnet-4-6` | Via `@ai-sdk/anthropic` (v1.x) |
| Gmail 2FA | imapflow | IMAP App Password auth |
| Chat | ~~`@anthropic-ai/sdk`~~ | **Removed** — upload PDFs to Claude.ai directly |
| Cloud browser (future) | Browserbase | Switch via `BROWSER_PROVIDER=browserbase` |

### Critical: Stagehand model setup
Stagehand v2.5.8's built-in model whitelist only contains retired Claude 3.7 models. We bypass it using `AISdkClient` + `@ai-sdk/anthropic@1.x` (must be `@1.x`, not `@3.x` — Stagehand's internal `ai@4.x` requires AI SDK spec v1):

```typescript
const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const baseModel = anthropic("claude-sonnet-4-6");
const model = new Proxy(baseModel, {
  get(target, prop) {
    if (prop === "doGenerate" || prop === "doStream") {
      return (opts: any) => (target as any)[prop]({ maxTokens: 16384, ...opts });
    }
    const val = (target as any)[prop];
    return typeof val === "function" ? val.bind(target) : val;
  },
});
const llmClient = new AISdkClient({ model });
```

---

## 10. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | For browser AI actions + chat |
| `MYCHART_URL` | Yes | Full login URL for target MyChart instance |
| `MYCHART_USERNAME` | Yes | MyChart username (skips stdin prompt) |
| `MYCHART_PASSWORD` | Yes | MyChart password (skips stdin prompt) |
| `GMAIL_USER` | Recommended | Gmail address for auto-2FA |
| `GMAIL_APP_PASSWORD` | Recommended | Gmail App Password (not account password) |
| `BROWSER_PROVIDER` | No | `stagehand-local` (default), `browserbase`, `local` |
| `BROWSERBASE_API_KEY` | If browserbase | |
| `BROWSERBASE_PROJECT_ID` | If browserbase | |
| `FORCE_LABS` | No | Set to `1` to re-extract labs even if output exists |
| `FORCE_VISITS` | No | Set to `1` to re-extract visits |
| `FORCE_MEDS` | No | Set to `1` to re-extract medications |
| `FORCE_MSGS` | No | Set to `1` to re-extract messages |

---

## 11. Current Codebase Layout (Phase 1)

```
browser-agent-team/
├── PRD.md                   # This document
├── ARCHITECTURE.md          # Technical architecture detail
├── BROWSER_RESEARCH.md      # Browser stack rationale
├── src/
│   ├── extract/
│   │   ├── index.ts         # Main extraction pipeline (entry point)
│   │   ├── labs.ts          # extractLabsDocs(), extractLabsJson()
│   │   ├── visits.ts        # extractVisits()
│   │   ├── medications.ts   # extractMedications()
│   │   ├── messages.ts      # extractMessages()
│   │   └── helpers.ts       # slugify, savePageAsHtml, navigateWithRetry, buildIndex
│   ├── auth.ts              # doLogin, ensureLoggedIn, fetchGmailVerificationCode
│   ├── session.ts           # loadSavedSession, saveSession, clearSession
│   ├── chat.ts              # Interactive Claude chat
│   ├── package.ts           # Zip packager
│   ├── 2fa-relay.ts         # Standalone Gmail IMAP 2FA helper
│   ├── schemas.ts           # Zod schemas (LabPanel, Visit, Medication, Message)
│   ├── imap.ts              # extractVerificationCode()
│   └── browser/
│       ├── interface.ts     # BrowserProvider interface
│       ├── index.ts         # Provider factory
│       ├── page-eval.ts     # Shared browser-side eval functions
│       └── providers/
│           ├── stagehand-local.ts
│           ├── stagehand-browserbase.ts
│           └── playwright-local.ts
├── output/                  # Extracted records (gitignored)
└── .env                     # Credentials (gitignored)
```

### Commands
```bash
pnpm extract               # Extract all records → output/
pnpm chat                  # Interactive Claude chat about records
pnpm package               # Bundle output/ into mychart-YYYY-MM-DD.zip
FORCE_LABS=1 pnpm extract  # Re-extract labs
FORCE_VISITS=1 pnpm extract  # Re-extract visits
FORCE_MEDS=1 pnpm extract    # Re-extract medications
FORCE_MSGS=1 pnpm extract    # Re-extract messages
```

---

## 12. Phase 1 — Refactor + Stabilize ✅ COMPLETE

**Goal:** Turn the spike into a proper application. Fix reliability. Migrate to PDF output.

### P1.1 — Refactor out of spike/ ✅
- Moved `spike/src/` → `src/` with proper module splits
- Split monolithic `spike.ts` (~1100 lines) into `src/extract/` modules
- Root `package.json`, `tsconfig.json`, `.env.example`
- `pnpm extract` replaces `cd spike && pnpm spike`
- `spike/` deleted after validation

### P1.2 — Fix messages extraction reliability ✅
- `navigateWithRetry()` — one automatic retry after 5s on network errors
- Per-thread skip logic — partial runs resume from where they left off
- Validated: all 28 message threads extracted cleanly

### P1.3 — PDF output migration ✅
- All records captured as PDFs via Playwright `page.pdf()`
- `waitForLoadState("networkidle")` added before capture — fixes blank imaging reports
- Per-section merged PDFs: `output/labs.pdf`, `visits.pdf`, `medications.pdf`, `messages.pdf`
- Shared `mergePdfs()` helper in `helpers.ts`
- Removed: HTML capture, JSON structured extraction, `schemas.ts`, `package.ts`, `archiver`, zip output, `pnpm chat`
- `labs.pdf` validated (4.5 MB, 36 records including imaging reports); visits/meds/messages need re-extraction

### P1.4 — Proper CLI (deferred)
Deferred — `pnpm extract` is sufficient for current single-user use.

---

## 13. Phase 2 — Cloud Deployment (NEXT)

**Goal:** Run the browser in the cloud so extraction doesn't need the user's machine.

- Set `BROWSER_PROVIDER=browserbase` — orchestrator still runs locally, browser in Browserbase cloud
- `StagehandBrowserbaseProvider` already implemented — no other code changes needed
- Add Railway deployment for the orchestrator process
- Pre-signed S3/R2 URL for PDF delivery
- Store session cookies in Browserbase Contexts (persistent across sessions)

---

## 14. Phase 3 — Multi-User

- Web UI for triggering and managing extractions
- Secure credential handling (never stored server-side)
- HIPAA groundwork: no health data in logs, TTL on cloud storage, BAA path

---

## 15. Active Technical Decisions

| Decision | Choice | Date |
|---|---|---|
| Browser stack | Stagehand v2.5.8 + local Chromium (dev); Browserbase (prod path) | 2026-04-12 |
| Claude model for browser AI | `claude-sonnet-4-6` via `AISdkClient` (bypasses Stagehand whitelist) | 2026-04-12 |
| 2FA | Gmail IMAP auto-fetch (App Password); file-based relay fallback | 2026-04-13 |
| Record output format | Full-page HTML (primary) + structured JSON (secondary) | 2026-04-13 |
| Chat | Direct Anthropic SDK streaming, all records in system context | 2026-04-13 |
| Session persistence | Cookie save/restore (session.json), 12h TTL | 2026-04-13 |
| Health data | Gitignored, local-only, never committed or logged | 2026-04-13 |
| Navigation reliability | `navigateWithRetry()` + per-item skip for partial-run resume | 2026-04-13 |
