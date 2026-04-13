# MyChart Browser Agent — Product Requirements Document

**Version:** 0.2 (updated to reflect v0 completion)  
**Date:** 2026-04-13  
**Status:** v0 complete; Phase 1 (stabilize + package) in progress

---

## 1. Overview

An AI agent that uses browser automation to log into Epic MyChart, navigate the patient portal, extract health records as human-readable documents, and deliver them to a local folder. An interactive Claude chat session then lets the user ask questions about their records.

No APIs or FHIR connectors — browser automation only.

---

## 2. Users

### v0 (current)
- **Primary user:** A single technical user comfortable with CLI tools.
- **Interaction model:** `pnpm extract` to pull records, `pnpm chat` to analyze them.
- **2FA:** Fully automated via Gmail IMAP — no manual intervention required.

### Future
- Non-technical users via a web UI or guided CLI wizard.
- Multi-user support with secure per-user credential handling.

---

## 3. Goals

| Goal | Status |
|---|---|
| Authenticate into MyChart including 2FA | ✅ Done (Gmail auto-2FA) |
| Navigate to lab results and extract full content | ✅ Done (36 HTML docs) |
| Extract visit notes | ✅ Done (HTML + JSON) |
| Extract imaging reports | ✅ Done (captured within lab HTML) |
| Extract medication list | ✅ Done (needs nav fix re-run) |
| Extract messages / inbox | ✅ Done (HTML + JSON) |
| Deliver records as human-readable local files | ✅ Done (HTML + browsable index) |
| AI review: interactive chat about records | ✅ Done (`pnpm chat`) |
| Package records as a zip file | ⬜ Not yet built |
| Proper CLI entry point (`mychart-agent fetch`) | ⬜ Not yet built |

---

## 4. Record Types

All priority levels have been implemented:

| Priority | Record Type | Status |
|---|---|---|
| P0 | Lab results (blood work, metabolic panels) | ✅ Full HTML + structured JSON |
| P0 | Imaging reports (MRI, CT, X-ray, ECG) | ✅ Captured within lab HTML |
| P1 | Doctor/clinic visit notes | ✅ HTML + JSON |
| P2 | Medication lists | ✅ HTML (nav fix in progress) |
| P2 | Messages / inbox threads | ✅ HTML + JSON |

---

## 5. User Journey (v0)

### 5.1 Extract Records
```bash
cd spike
pnpm spike
```
The agent:
1. Restores saved session if < 12h old (skips login + 2FA)
2. If no session: logs in using credentials from `.env`, auto-fetches 2FA code from Gmail
3. Navigates to each section and extracts full page content as HTML documents
4. Builds `output/index.html` — a browsable local index of all records
5. Saves all records to `output/` (gitignored)

### 5.2 Browse Records
Open `output/index.html` in a browser. Click any document to view it with formatting.

### 5.3 Chat with Claude about Records
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
├── labs.json               # Structured lab index (panel names, dates, values)
├── labs/
│   ├── 001_lipid-panel-apr-21-2025.html
│   ├── 002_mr-shoulder-without-contrast-dec-04-2025.html
│   └── ...                 # One .html per lab/imaging result
├── visits/
│   ├── 001_visit-title.html
│   ├── 001_visit-date_visit-type.json
│   └── ...
├── medications/
│   ├── medications.html
│   └── medications.json
└── messages/
    ├── 001_thread-title.html
    ├── 001_date_subject.json
    └── ...
```

**HTML files:** Full page content captured from MyChart, wrapped in a simple readable shell. Tables render correctly. Narrative text (radiology reports, clinical notes) is preserved in full.

**JSON files:** Structured extraction (best-effort, may be empty for narrative-only documents). Useful for downstream processing.

**index.html:** Links to every document, organized by section.

### Planned (Phase 1)
Add zip packaging:
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

| Scenario | Current Behavior |
|---|---|
| Invalid credentials | Clear error message, exits |
| Session expired mid-run | `ensureLoggedIn()` detects and re-authenticates before each section |
| 2FA code not found in Gmail | Falls back to file-based relay (`output/2fa.code`) |
| Page structure changed | `observe()` returns 0 results, saves screenshot, continues to next section |
| Extraction schema failure | Saves HTML (never fails) + logs JSON extraction error |
| Network/browser failure | Error logged, browser kept open for inspection |

---

## 9. Success Criteria (v0)

All met:

1. ✅ User can run `pnpm spike` and authenticate without touching 2FA manually
2. ✅ Agent extracts labs (including imaging reports) as full readable documents
3. ✅ Agent extracts visits, medications, messages
4. ✅ User can open `output/index.html` and browse all records
5. ✅ User can run `pnpm chat` and have a Claude conversation about their records
6. ✅ No credentials or health data committed to git

---

## 10. Future Considerations

- **Zip delivery** — bundle output/ into a dated zip (Phase 1)
- **Proper CLI** — `mychart-agent fetch` / `mychart-agent chat` (Phase 1)
- **Cloud browser** — switch to Browserbase so extraction doesn't require local machine (Phase 2)
- **Multi-user** — web UI, secure per-user credentials (Phase 3)
- **HIPAA compliance** — BAA with cloud providers, audit logging (Phase 3+)
- **Scheduled runs** — cron-style fetch with notifications on new results
- **PDF download** — for records that have a "Download PDF" button in MyChart
