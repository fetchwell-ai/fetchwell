# MyChart Agent — Project Plan

**Last updated:** 2026-04-12  
**Repo:** github.com/chadallen/mychart-agent

---

## What this is

An AI agent that logs into Epic MyChart via browser automation (no APIs/FHIR), extracts health records, and delivers them as a zip file. Built for a single technical user (Chad) as an MVP, with architecture that can grow into a multi-user product.

See [PRD.md](PRD.md) for full product requirements, [ARCHITECTURE.md](ARCHITECTURE.md) for technical design, [BROWSER_RESEARCH.md](BROWSER_RESEARCH.md) for browser stack rationale.

---

## Phase 0 — Spike (COMPLETE ✓)

**Goal:** Validate the three core technical assumptions before building anything real.

### Assumptions to validate
1. Can we create a browser session and drive it programmatically via a `BrowserProvider` abstraction?
2. Can we handle 2FA without the user being at the browser?
3. Can Stagehand's `extract()` pull structured lab data from a MyChart page?

### Results
All three validated on 2026-04-12 against UCSF MyChart.

| Assumption | Result | Notes |
|---|---|---|
| Browser session + BrowserProvider | ✓ | Stagehand local + Playwright works |
| 2FA without browser access | ✓ | File-based code relay (`output/2fa.code`) works |
| `extract()` structured lab data | ✓ (partial) | 21 panels extracted; values `<UNKNOWN>` because list page doesn't show them |

### Key technical findings

**Stack:**
- Stagehand v2.5.8 + `AISdkClient` + `@ai-sdk/anthropic@1.x` + `claude-sonnet-4-6`
- Stagehand's built-in model whitelist only has retired Claude 3.7 models. Workaround: pass a custom `AISdkClient` with the Anthropic AI SDK directly — bypasses the whitelist entirely.
- Stagehand's `AISdkClient` doesn't pass `maxTokens` to `generateObject`, causing 4096-token truncation. Workaround: Proxy wrapper that injects `maxTokens: 16384`.

**UCSF MyChart login is two-step:** username submit → Next → password page → Sign In.

**Session persistence:** Cookies saved to `output/session.json` after successful login (12h TTL). Next run restores session and skips login + 2FA entirely.

**File-based 2FA relay:**
- Spike writes `output/2fa.needed` when waiting for code
- Relay: `echo "123456" > output/2fa.code`
- Uses `fs.watch` (event-driven) + 10s poll fallback for reliability
- Spike types the code into the browser via `act()` and submits automatically

**Extraction gap:** The labs list page shows panel names + dates but not actual values. Values, units, and reference ranges are one level deeper (click into each panel). This is the main Phase 1 task.

**Token limit:** Even with 16384 output tokens, the full labs list extraction sometimes fails. Phase 1 needs pagination.

### Spike artifacts
- `/spike/src/spike.ts` — main test script
- `/spike/src/browser/` — `BrowserProvider` interface + three provider implementations
- `/spike/src/schemas.ts` — Zod schemas for lab data
- `/spike/output/session.json` — saved session (gitignored)
- `/spike/.env` — credentials (gitignored), see `.env.example`

---

## Phase 1 — MVP (NEXT)

**Goal:** Working end-to-end flow that extracts real lab values and delivers a zip file.

### P1.1 — Drill into lab panels for actual values
The labs list page shows panel names and dates. Click into each panel to get:
- Individual test results (e.g., WBC, RBC, hemoglobin within a CBC)
- Actual values and units
- Reference ranges
- Abnormal flags (H/L)

Strategy: After navigating to the labs list, iterate over each panel, click in, extract structured data, click back.

### P1.2 — Handle extraction pagination
The labs list has many panels. Extract in batches (e.g., 5 at a time) or filter to most recent N results to avoid token limit errors.

### P1.3 — Package output as zip
- Structured JSON per panel: `labs/2026-03-15_lipid-panel.json`
- Screenshot fallback for panels that resist extraction
- `metadata.json` with run timestamp, account, total results
- Zip all of the above: `mychart-labs-2026-04-12.zip`

### P1.4 — CLI entry point
Replace the spike script with a proper CLI:
```
mychart-agent fetch-labs
```
Options: `--url`, `--username`, `--output-dir`

### P1.5 — Session management UX
- Current: session auto-restored if `output/session.json` < 12h old
- Improve: `--fresh` flag to force new login; clearer messaging when session restores vs. expires

### P1.6 — Error handling
Per the PRD error table: invalid credentials, 2FA timeout, page structure changes, no results found.

---

## Phase 2 — Cloud deployment

**Goal:** Run the agent in the cloud (not locally).

- Switch `BROWSER_PROVIDER=browserbase` — orchestrator still runs locally, browser runs in Browserbase cloud
- Add Railway deployment for the orchestrator process (see ARCHITECTURE.md)
- 2FA via Browserbase debug URL (user opens URL in their browser)
- Pre-signed S3/R2 URL for zip delivery
- HIPAA groundwork: no health data in logs, TTL on cloud storage

---

## Phase 3 — Additional record types

After labs are solid:
- **Visit notes** (P1 per PRD)
- **Imaging reports** (P2)
- **Medication lists** (P2)

---

## Phase 4 — AI review pipeline

Pass extracted structured data to Claude for:
- Plain-language summaries
- Trend analysis across visits
- Flagging abnormal results

---

## Active decisions / open questions

| Question | Decision | Date |
|---|---|---|
| Browser stack | Stagehand + local Chromium for dev; Browserbase for prod | 2026-04-12 |
| Model for browser AI | `claude-sonnet-4-6` via `AISdkClient` (bypasses Stagehand whitelist) | 2026-04-12 |
| 2FA automation | File-based relay for now; Gmail IMAP (App Password) when ready | 2026-04-12 |
| Hosting | Railway for fast-follow after local validation; AWS for HIPAA path | 2026-04-12 |
| Record priority | Labs only for MVP | 2026-04-12 |

---

## Immediate next steps

1. [ ] Build panel drill-down — click into each lab panel, extract actual values
2. [ ] Add pagination/batching for large lab lists
3. [ ] Package extracted data as zip with metadata.json
4. [ ] Wire up a real CLI entry point (`mychart-agent fetch-labs`)
5. [ ] Test against a second MyChart instance to check portability
