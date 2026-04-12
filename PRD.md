# MyChart Browser Agent — Product Requirements Document

**Version:** 0.1 (MVP)
**Date:** 2026-04-12
**Author:** Product Manager Agent

---

## 1. Overview

A cloud-hosted AI agent that uses browser automation to log into Epic MyChart, navigate the patient portal, extract health records, and deliver them as a downloadable zip file. The agent operates via CLI for the MVP, with architecture that supports a future GUI or more accessible interface.

No APIs or FHIR connectors — browser automation only.

## 2. Users

### MVP (v0.1)
- **Primary user:** A single technical user comfortable with CLI tools, browser automation concepts, and cloud infrastructure.
- **Interaction model:** CLI invocation with manual credential entry and 2FA code input per session.

### Future
- Non-technical users (family members, patients with limited tech skills).
- Architecture decisions made now must not block a future web UI, mobile companion, or guided wizard experience.

## 3. Goals

1. Authenticate into a MyChart account via cloud-hosted browser automation.
2. Navigate to lab results and extract them.
3. Package extracted records into a downloadable zip file.
4. Provide a CLI interface for triggering and interacting with the agent.

### Non-Goals (MVP)
- Persistent credential storage or session management.
- HIPAA/BAA compliance certification.
- Multi-account or family account support.
- Automated 2FA resolution.
- Real-time streaming of results.

## 4. Record Types — Priority Order

| Priority | Record Type | Target Release |
|----------|-------------|----------------|
| P0 | Lab results (blood work, metabolic panels, etc.) | MVP |
| P1 | Doctor/clinic visit notes | v0.2 |
| P2 | Imaging reports (radiology, MRI, etc.) | v0.3 |
| P3 | Medication lists | v0.3 |

## 5. User Journey (MVP)

### 5.1 Trigger the Agent
1. User runs a CLI command (e.g., `mychart-agent fetch-labs`).
2. Agent prompts for MyChart username and password via stdin.
3. Agent launches a cloud-hosted browser session (e.g., via Browserbase or similar service).

### 5.2 Login & Authentication
1. Agent navigates to the user's MyChart login page.
2. Agent enters the provided credentials.
3. If 2FA is triggered, the agent detects the challenge and surfaces a Browserbase session debug URL in the CLI.
4. User opens the debug URL in their own browser and enters the 2FA code directly into the live cloud browser session.
5. Agent detects that 2FA is complete and proceeds with the authenticated session.
6. On login failure, the agent reports the error clearly and exits.

### 5.3 Record Extraction
1. Agent navigates to the lab results section of MyChart.
2. Agent identifies and extracts available lab results — structured data where possible, fallback to screenshot/PDF capture.
3. Agent stores extracted records in a temporary cloud location.

### 5.4 Delivery
1. Agent packages all extracted records into a zip file.
2. Agent provides a download URL (pre-signed, time-limited) or streams the zip to the CLI.
3. Temporary cloud storage is cleaned up after download or after a short TTL.

### 5.5 Optional: AI Review (Future)
- Downloaded records can be passed to a Claude agent for interpretation, trend analysis, or plain-language summaries.
- Out of scope for MVP but the output format should be structured enough to support this.

## 6. Authentication & Security

### 6.1 Credentials (MVP)
- **No persistent credential storage.** User provides username and password each run.
- Prefer a browser automation solution with built-in credential/session management (e.g., Browserbase contexts) to avoid writing custom credential storage code.
- Credentials are held in memory only for the duration of the session and never written to disk or logs.

### 6.2 Two-Factor Authentication (MVP)
- **Debug URL handoff.** When MyChart presents a 2FA challenge, the agent detects it and surfaces a Browserbase session debug URL. The user opens this URL in their own browser and completes the 2FA challenge directly in the live cloud browser session.
- The agent must detect when 2FA is complete and resume automation.
- Supports any 2FA method MyChart uses (SMS, email, authenticator) since the user interacts with the real browser.
- **Future:** Automated 2FA via Gmail integration — agent reads the verification code from the user's email automatically.

### 6.3 Session Persistence
- **No session persistence for MVP.** Each run is a fresh login.
- Future versions may explore cookie/session reuse to reduce 2FA friction.

## 7. Infrastructure & Hosting

### 7.1 Cloud-Hosted Browser
- **MVP architecture:** The orchestration layer (Node.js process) runs locally on the developer's machine. Only the browser itself runs remotely in Browserbase's cloud. The local process controls the cloud browser via Browserbase's SDK/API.
- The local CLI communicates with the cloud browser to drive automation and receive extracted data.
- For 2FA, the agent surfaces a Browserbase debug URL so the user can interact with the live cloud browser directly.

### 7.2 File Storage & Delivery
- Extracted records are temporarily stored in cloud storage (e.g., S3, R2, or the browser service's built-in storage).
- Delivered as a downloadable zip file via pre-signed URL or direct CLI download.
- Temporary storage is cleaned up after download or after a configurable TTL (default: 1 hour).

### 7.3 Health Data Privacy
- **MVP stance:** Accept risk. This is a personal tool for a single technical user.
- **Architectural guardrails for future compliance:**
  - No health data written to persistent logs.
  - Temporary storage only — no long-lived data at rest in the cloud.
  - Clear data flow documentation so a future HIPAA/BAA audit path is feasible.
  - Encryption in transit (TLS) for all communications.
  - Cloud provider selection should favor services that offer BAA options (e.g., AWS, GCP) even if not activated for MVP.

## 8. Output Format

### Zip File Contents
```
mychart-labs-2026-04-12/
├── metadata.json          # Run metadata: timestamp, account, records found
├── labs/
│   ├── 2026-03-15_cbc.json       # Structured lab data (when extractable)
│   ├── 2026-03-15_cbc.pdf        # PDF/screenshot fallback
│   ├── 2026-01-20_metabolic.json
│   └── 2026-01-20_metabolic.pdf
└── raw/                   # Raw page captures for debugging
    └── ...
```

- **Structured data (JSON):** Preferred. Lab name, date, values, reference ranges, units.
- **PDF/screenshot fallback:** For records that resist structured extraction.
- **Metadata file:** Captures run context for traceability.

> **Note:** The directory structure above reflects the MVP (labs only). Future versions will add sibling directories for additional record types (e.g., `visits/`, `imaging/`, `medications/`).

## 9. Error Handling & Edge Cases

| Scenario | MVP Behavior |
|----------|-------------|
| Invalid credentials | Clear error message, exit |
| 2FA timeout (user too slow) | Retry prompt up to 2 times, then exit with instructions |
| MyChart page structure changed | Graceful failure with error details; save screenshot for debugging |
| No lab results found | Report "no results found," exit cleanly |
| Network/browser session failure | Retry once, then exit with error |
| Multiple MyChart instances (different health systems) | Out of scope — user specifies target MyChart URL at invocation |

## 10. Future Considerations

These are explicitly out of MVP scope but should not be blocked by architectural decisions:

- **Multi-account support:** Fetch from multiple MyChart instances in one run.
- **Family/proxy accounts:** Handle linked family member accounts.
- **Scheduled runs:** Cron-style automated fetching with notification on new results.
- **Web UI:** Browser-based dashboard for triggering fetches and viewing results.
- **AI review pipeline:** Pass structured output directly to Claude for analysis.
- **Automated 2FA via Gmail:** Agent reads verification codes from email automatically.
- **HIPAA compliance:** BAA with cloud providers, audit logging, encryption at rest.

## 11. Success Criteria (MVP)

1. User can invoke the agent from CLI and authenticate into their MyChart account (including 2FA).
2. Agent successfully navigates to lab results and extracts at least the most recent set.
3. Agent delivers a zip file containing structured lab data and/or PDF captures.
4. The entire flow completes in under 3 minutes for a typical account.
5. Failures produce clear, actionable error messages.
