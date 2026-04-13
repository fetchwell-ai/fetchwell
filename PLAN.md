# MyChart Agent — Project Plan

**Last updated:** 2026-04-13  
**Repo:** github.com/chadallen/mychart-agent

---

## What this is

An AI agent that logs into Epic MyChart via browser automation (no APIs/FHIR), extracts health records as HTML documents, and provides an interactive Claude chat session for analysis. Built for a single technical user as a v0, with architecture that can grow into a multi-user product.

See [PRD.md](PRD.md) for product requirements, [ARCHITECTURE.md](ARCHITECTURE.md) for technical design, [BROWSER_RESEARCH.md](BROWSER_RESEARCH.md) for browser stack rationale.

---

## Phase 0 — Spike (COMPLETE ✓)

**Goal:** Validate the three core technical assumptions before building anything real.

| Assumption | Result | Notes |
|---|---|---|
| Browser session + BrowserProvider abstraction | ✓ | Stagehand local + Playwright works |
| 2FA without browser access | ✓ | Gmail IMAP auto-fetch (exceeded original file-relay goal) |
| `extract()` structured lab data | ✓ | Full HTML capture more reliable than schema-based extraction |

---

## Current State — v0 (COMPLETE ✓)

Everything below was built within the spike and works end-to-end against UCSF MyChart.

### What works

**Extraction (`pnpm spike`):**
- Login with Gmail auto-2FA — no manual intervention required
- Session persistence — 12h TTL session.json, skips login + 2FA on reuse
- Labs: 36 HTML documents (full page capture including imaging reports, MRI/CT/ECG narrative text)
- Visits: HTML + JSON per visit (nav bug under active fix; JSON fallback works)
- Medications: HTML page capture (nav fix in progress)
- Messages: HTML + JSON per thread (nav bug under active fix; JSON fallback works)
- Browsable `output/index.html` — click to open any document locally

**Chat (`pnpm chat`):**
- Loads all extracted HTML/JSON into Claude Sonnet context (~29K tokens for current record set)
- Auto-generates clinical summary on launch
- Interactive streaming Q&A — goes back and forth with Claude about your records
- `/summary`, `/clear`, `/exit` commands

### Known issues / in-progress fixes
- Session expires mid-run during long labs crawl (fix committed: `ensureLoggedIn()` before each section)
- Visits and Messages HTML extraction gets 0 `observe()` results after labs crawl (same fix)
- Medications HTML occasionally captures login page instead of meds list (same fix)
- Lab HTML filenames are generic (`ucsf-mychart-test-details`) for run5; fixed in code for run6+

### File layout
```
spike/
├── src/
│   ├── spike.ts          # Extraction pipeline (~850 lines)
│   ├── chat.ts           # Interactive Claude chat
│   ├── 2fa-relay.ts      # Standalone Gmail IMAP 2FA helper
│   ├── schemas.ts        # Zod schemas (LabPanel, Visit, Medication, Message)
│   └── browser/
│       ├── interface.ts  # BrowserProvider interface
│       ├── index.ts      # Provider factory
│       └── providers/
│           ├── stagehand-local.ts      # Default (local Chromium + Stagehand)
│           ├── stagehand-browserbase.ts  # Cloud browser option
│           └── playwright-local.ts    # Plain Playwright fallback
├── output/               # Extracted records (gitignored — health data)
│   ├── index.html        # Browsable index of all documents
│   ├── labs/             # One .html per lab/imaging result
│   ├── visits/           # One .html + .json per visit
│   ├── medications/      # medications.html + medications.json
│   ├── messages/         # One .html + .json per message thread
│   └── labs.json         # Structured index (panel names, dates, values)
└── .env                  # Credentials (gitignored)
```

### Commands
```bash
pnpm spike          # Extract all records → output/
pnpm chat           # Interactive Claude chat about your records
FORCE_LABS=1 pnpm spike    # Re-extract labs even if output/labs/ exists
FORCE_VISITS=1 pnpm spike  # Re-extract visits
FORCE_MEDS=1 pnpm spike    # Re-extract medications
FORCE_MSGS=1 pnpm spike    # Re-extract messages
```

---

## Phase 1 — Stabilize and Package (NEXT)

**Goal:** Fix remaining bugs, add zip delivery, clean up the codebase.

### P1.1 — Fix extraction nav bugs ← IN PROGRESS
- `ensureLoggedIn()` now called before each section (committed, not yet run-tested)
- Run spike-run6 to verify visits, medications, messages all extract correctly

### P1.2 — Zip packaging + metadata
Build a zip at the end of extraction:
```
mychart-2026-04-13/
├── metadata.json         # Run timestamp, record counts, any errors
├── labs/                 # All lab HTML + index JSON
├── visits/               # All visit HTML + JSON
├── medications/
└── messages/
```
Add `pnpm package` or make zip the final step of `pnpm spike`.

### P1.3 — Refactor out of spike/
The "spike" has grown into the real product. Rename and reorganize:
- Move `spike/src/` → `src/`
- Split `spike.ts` into `src/extract/index.ts`, `src/extract/labs.ts`, `src/extract/visits.ts`, etc.
- Rename `pnpm spike` → `pnpm extract`
- Move `spike/package.json` → root `package.json`
- Add proper README

### P1.4 — CLI entry point
Proper CLI command instead of `pnpm extract`:
```bash
mychart-agent fetch      # Extract all records
mychart-agent chat       # Start chat session
mychart-agent fetch --section labs  # Re-extract single section
```

---

## Phase 2 — Cloud deployment

**Goal:** Run the browser in the cloud (not locally) so extraction doesn't need the user's machine.

- Switch `BROWSER_PROVIDER=browserbase` — orchestrator still runs locally, browser in Browserbase cloud
- 2FA via Browserbase debug URL (or keep Gmail auto-2FA — it's already working)
- Add Railway deployment for the orchestrator process
- Pre-signed S3/R2 URL for zip delivery

---

## Phase 3 — Multi-user

- Web UI for triggering and managing extractions
- Secure credential handling (never stored server-side)
- HIPAA groundwork: no health data in logs, TTL on cloud storage, BAA path

---

## Active technical decisions

| Decision | Choice | Date |
|---|---|---|
| Browser stack | Stagehand v2.5.8 + local Chromium (dev); Browserbase (prod path) | 2026-04-12 |
| Claude model for browser AI | `claude-sonnet-4-6` via `AISdkClient` (bypasses Stagehand whitelist) | 2026-04-12 |
| 2FA | Gmail IMAP auto-fetch (App Password); file-based relay fallback | 2026-04-13 |
| Record output format | Full-page HTML (primary) + structured JSON (secondary) | 2026-04-13 |
| Chat | Direct Anthropic SDK streaming, all records in system context | 2026-04-13 |
| Session persistence | Cookie save/restore (session.json), 12h TTL | 2026-04-13 |
| Health data | Gitignored, local-only, never committed or logged | 2026-04-13 |
