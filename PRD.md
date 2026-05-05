# MyChart Browser Agent — Product & Engineering Document

**Version:** 0.6
**Date:** 2026-04-14
**Status:** Phase 1 complete. Phase 2 (Browserbase cloud deployment) is next. See `plan.MD`.

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

| Goal | Phase |
|---|---|
| Authenticate into MyChart including 2FA | 0 |
| Extract lab results as PDFs | 0 |
| Extract visit notes | 0 |
| Extract imaging reports | 0 |
| Extract medication list | 0 |
| Extract messages / inbox | 0 |
| Deliver records as merged PDFs for Claude.ai upload | 0 |
| AI review: interactive chat about records | 0 (Deprecated — use Claude.ai with exported PDFs) |
| Refactor out of spike/ into proper application structure | 1 |
| Fix messages extraction reliability (network timeout) | 1 |
| PDF output migration (replace HTML/JSON/zip) | 1 |
| Proper CLI entry point (`mychart-agent fetch`) | 1 (Deferred) |
| Cloud browser (Browserbase) | 2 |
| Multi-user web UI | 3 |

---

## 4. Record Types

| Priority | Record Type |
|---|---|
| P0 | Lab results (blood work, metabolic panels) |
| P0 | Imaging reports (MRI, CT, X-ray, ECG) |
| P1 | Doctor/clinic visit notes |
| P2 | Medication lists |
| P2 | Messages / inbox threads |

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
Open `output/index.html` in a browser. Click any document to view it.

### 5.3 Chat with Claude
Chat feature removed. Upload the 4 merged PDFs from `output/` to Claude.ai — it reads PDFs natively.

---

## 6. Authentication & Security

### Credentials
- Provided via `providers.json` (see `providers.example.json`)
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
- No health data written to logs or transmitted to third parties (beyond Anthropic API for browser navigation)
- `output/session.json` contains only browser cookies, not health records

---

## 7. Output Format

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
| Network timeout during navigation | `navigateWithRetry()` retries once after 5s before propagating error |
| Network/browser failure | Error logged, browser kept open for inspection |
