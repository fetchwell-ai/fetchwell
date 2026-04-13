# MyChart Browser Agent — Product & Engineering Document

**Version:** 0.3 (merged from PRD.md + PLAN.md)  
**Date:** 2026-04-13  
**Status:** v0 complete; Phase 1 (refactor + stabilize) is next

---

## 1. Overview

An AI agent that uses browser automation to log into Epic MyChart, navigate the patient portal, extract health records as human-readable HTML documents, and deliver them to a local folder. An interactive Claude chat session lets the user ask questions about their records.

No APIs or FHIR connectors — browser automation only.

---

## 2. Users

### v0 / Phase 1 (current)
- **Primary user:** A single technical user comfortable with CLI tools.
- **Interaction model:** `pnpm extract` to pull records, `pnpm chat` to analyze them.
- **2FA:** Fully automated via Gmail IMAP — no manual intervention required.

### Future (Phase 3+)
- Non-technical users via a web UI or guided CLI wizard.
- Multi-user support with secure per-user credential handling.

---

## 3. Goals by Phase

| Goal | Phase | Status |
|---|---|---|
| Authenticate into MyChart including 2FA | 0 | ✅ Done (Gmail auto-2FA) |
| Extract lab results as full HTML documents | 0 | ✅ Done (36 HTML docs) |
| Extract visit notes | 0 | ✅ Done (HTML + JSON) |
| Extract imaging reports | 0 | ✅ Done (captured within lab HTML) |
| Extract medication list | 0 | ✅ Done |
| Extract messages / inbox | 0 | ✅ Done (28 threads targeted; 13 reliable so far) |
| Deliver records as human-readable local files + index | 0 | ✅ Done |
| AI review: interactive chat about records | 0 | ✅ Done (`pnpm chat`) |
| Refactor out of spike/ into proper application structure | 1 | ⬜ Next |
| Fix messages extraction reliability (network timeout on thread 13) | 1 | ⬜ Next |
| Zip packaging + metadata.json | 1 | ⬜ Not yet built |
| Proper CLI entry point (`mychart-agent fetch`) | 1 | ⬜ Not yet built |
| Cloud browser (Browserbase) | 2 | ⬜ Future |
| Multi-user web UI | 3 | ⬜ Future |

---

## 4. Record Types

| Priority | Record Type | Status |
|---|---|---|
| P0 | Lab results (blood work, metabolic panels) | ✅ Full HTML + structured JSON |
| P0 | Imaging reports (MRI, CT, X-ray, ECG) | ✅ Captured within lab HTML |
| P1 | Doctor/clinic visit notes | ✅ HTML + JSON |
| P2 | Medication lists | ✅ HTML |
| P2 | Messages / inbox threads | ✅ HTML + JSON (28 threads; reliability fix in Phase 1) |

---

## 5. User Journey (v0)

### 5.1 Extract Records
```bash
cd spike        # (will become root after Phase 1 refactor)
pnpm spike      # (will become pnpm extract)
```
The agent:
1. Restores saved session if < 12h old (skips login + 2FA)
2. If no session: logs in using credentials from `.env`, auto-fetches 2FA code from Gmail
3. Navigates to each section and extracts full page content as HTML documents
4. Builds `output/index.html` — a browsable local index of all records
5. Saves all records to `output/` (gitignored)

### 5.2 Browse Records
Open `output/index.html` in a browser. Click any document to view it with formatting.

### 5.3 Chat with Claude
```bash
pnpm chat
```
1. Loads all extracted HTML/JSON into Claude Sonnet context
2. Generates an opening summary (lab values, visit highlights, medication list, message themes)
3. Interactive Q&A — ask anything about your records

---

## 6. Authentication & Security

### Credentials
- Provided via `.env` file (`MYCHART_USERNAME`, `MYCHART_PASSWORD`)
- Never committed to git, never logged
- Held in memory only for the duration of the session

### Two-Factor Authentication
- **Auto-2FA:** Agent fetches verification code from Gmail IMAP using an App Password
- **Fallback:** File relay — `echo "123456" > output/2fa.code`
- **Standalone relay:** `pnpm tsx src/2fa-relay.ts` runs alongside the spike as a separate process

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

### Current (v0)
```
output/
├── index.html              # Browsable index (open in browser)
├── labs.json               # Structured lab index
├── labs/
│   ├── 001_lipid-panel-apr-21-2025.html
│   └── ...                 # One .html per lab/imaging result (36 total)
├── visits/
│   ├── 001_visit-title.html
│   ├── 001_visit-date_visit-type.json
│   └── ...                 # One .html + .json per visit (12 total)
├── medications/
│   └── medications.html
└── messages/
    ├── 001_ucsf-mychart-conversation.html
    ├── 001_date_subject.json
    └── ...                 # One .html + .json per thread (28 targeted)
```

**HTML files:** Full page content captured from MyChart, wrapped in a simple readable shell. Tables render correctly. Narrative text (radiology reports, clinical notes) is preserved in full.

**JSON files:** Structured extraction (best-effort, may be empty for narrative-only documents).

### Planned (Phase 1)
```
mychart-2026-04-13.zip
├── metadata.json
├── labs/
├── visits/
├── medications/
└── messages/
```

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
| Chat | `@anthropic-ai/sdk` | Streaming, direct API |
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

## 11. Current Codebase Layout (v0 — pre-refactor)

```
browser-agent-team/
├── PRD.md                   # This document
├── ARCHITECTURE.md          # Technical architecture detail
├── BROWSER_RESEARCH.md      # Browser stack rationale
└── spike/                   # Phase 0 spike — to be refactored in Phase 1
    ├── src/
    │   ├── spike.ts              # Extraction pipeline (~900 lines)
    │   ├── chat.ts               # Interactive Claude chat
    │   ├── 2fa-relay.ts          # Standalone Gmail IMAP 2FA helper
    │   ├── schemas.ts            # Zod schemas (LabPanel, Visit, Medication, Message)
    │   └── browser/
    │       ├── interface.ts      # BrowserProvider interface
    │       ├── index.ts          # Provider factory
    │       └── providers/
    │           ├── stagehand-local.ts
    │           ├── stagehand-browserbase.ts
    │           └── playwright-local.ts
    ├── output/                   # Extracted records (gitignored)
    └── .env                      # Credentials (gitignored)
```

### Commands (current)
```bash
cd spike
pnpm spike          # Extract all records → output/
pnpm chat           # Interactive Claude chat about records
FORCE_LABS=1 pnpm spike    # Re-extract labs
FORCE_VISITS=1 pnpm spike  # Re-extract visits
FORCE_MEDS=1 pnpm spike    # Re-extract medications
FORCE_MSGS=1 pnpm spike    # Re-extract messages
```

---

## 12. Phase 1 — Refactor + Stabilize (NEXT)

**Goal:** Turn the spike into a proper application. Fix remaining reliability issues.

### P1.1 — Refactor out of spike/
The spike has grown into the real product. Rename and reorganize:
- Move `spike/src/` → `src/`
- Split `spike.ts` into `src/extract/index.ts`, `src/extract/labs.ts`, `src/extract/visits.ts`, `src/extract/medications.ts`, `src/extract/messages.ts`
- Move `spike/package.json` → root `package.json`
- Rename `pnpm spike` → `pnpm extract`
- Rename `spike.ts` → meaningful module names
- Apply `/simplify` code review findings

### P1.2 — Fix messages extraction reliability
Messages fail at thread 13-14 due to network timeout on `navigate(listUrl)`. Fixes committed in this session:
- `navigateWithRetry()` — one automatic retry after 5s on network errors
- Per-thread skip logic — partial runs resume from where they left off (threads 1-N already saved are skipped)
- These fixes need a full end-to-end validation run

### P1.3 — Zip packaging + metadata
Build a zip at the end of extraction:
```
mychart-2026-04-13/
├── metadata.json         # Run timestamp, record counts, any errors
├── labs/
├── visits/
├── medications/
└── messages/
```

### P1.4 — Proper CLI
```bash
mychart-agent fetch      # Extract all records
mychart-agent chat       # Start chat session
mychart-agent fetch --section labs  # Re-extract single section
```

---

## 13. Phase 2 — Cloud Deployment

**Goal:** Run the browser in the cloud so extraction doesn't need the user's machine.

- Set `BROWSER_PROVIDER=browserbase` — orchestrator still runs locally, browser in Browserbase cloud
- `StagehandBrowserbaseProvider` already implemented — no other code changes needed
- Add Railway deployment for the orchestrator process
- Pre-signed S3/R2 URL for zip delivery
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
