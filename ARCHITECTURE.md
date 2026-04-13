# MyChart Health Records Agent — Architecture

**Last updated:** 2026-04-13  
**Status:** v0 complete and running locally

---

## Overview

A TypeScript agent that uses a local (or cloud) browser to navigate Epic MyChart, authenticate as the patient, extract health records as full HTML documents, and expose them for interactive analysis via Claude. Local-first for v0, with a clear path to cloud deployment.

---

## 1. Stack

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

### Stagehand model setup (important)

Stagehand v2.5.8's built-in model whitelist only contains retired Claude 3.7 models. We bypass it using `AISdkClient` + `@ai-sdk/anthropic@1.x`:

```typescript
const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const baseModel = anthropic("claude-sonnet-4-6");
// Proxy to inject maxTokens — Stagehand doesn't pass it, causing 4096 truncation
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

`@ai-sdk/anthropic` must be `@1.x` — Stagehand uses `ai@4.x` internally which expects AI SDK spec v1. The `@3.x` package implements spec v2 and is incompatible.

---

## 2. System Block Diagram (v0 — local)

```
┌──────────────────────────────────────────────────────────────┐
│                       Developer's Machine                     │
│                                                              │
│  ┌────────────┐   pnpm spike    ┌─────────────────────────┐ │
│  │  Terminal   │ ─────────────▶ │   spike.ts              │ │
│  │             │                │                         │ │
│  │  pnpm chat  │ ─────────────▶ │   chat.ts               │ │
│  └────────────┘                 └───────────┬─────────────┘ │
│                                             │               │
│                               ┌─────────────┼─────────────┐ │
│                               │  BrowserProvider          │ │
│                               │  (Stagehand + Playwright) │ │
│                               └─────────────┬─────────────┘ │
│                                             │               │
│  ┌──────────────────┐                       │               │
│  │  output/          │◀──── Saves HTML/JSON  │               │
│  │  ├─ index.html    │                       │               │
│  │  ├─ labs/*.html   │                       │               │
│  │  ├─ visits/*.html │                       │               │
│  │  ├─ medications/  │                       │               │
│  │  └─ messages/     │                       │               │
│  └──────────────────┘                       │               │
│                                             ▼               │
│                               ┌─────────────────────────┐  │
│                               │  Local Chromium browser  │  │
│                               │  (Playwright-controlled) │  │
│                               └──────────┬──────────────┘  │
└──────────────────────────────────────────┼─────────────────┘
                                           │
                                    HTTPS  │
                     ┌─────────────────────┼──────────────────┐
                     │                     ▼                  │
                     │      UCSF MyChart (Epic)               │
                     │   ucsfmychart.ucsfmedicalcenter.org    │
                     └───────────────────────────────────────-┘
                                    
              Also:  ┌──────────────────────────────┐
                     │  Anthropic API (Claude)       │
                     │  - Browser actions (Stagehand)│
                     │  - Chat sessions (chat.ts)    │
                     └──────────────────────────────┘

                     ┌──────────────────────────────┐
                     │  Gmail IMAP                  │
                     │  - Auto-fetch 2FA codes      │
                     └──────────────────────────────┘
```

---

## 3. BrowserProvider Abstraction

All browser operations go through a `BrowserProvider` interface. This lets us swap backends without changing extraction logic.

```typescript
interface BrowserProvider {
  navigate(url: string): Promise<void>;
  act(instruction: string): Promise<void>;       // AI-powered
  extract<T>(schema: ZodSchema<T>, instruction: string): Promise<T>; // AI-powered
  observe(instruction: string): Promise<ObserveResult[]>;            // AI-powered
  pageText(): Promise<string>;   // Raw innerText, no AI
  pageHtml(): Promise<string>;   // Raw innerHTML, no AI
  screenshot(): Promise<string>; // base64 PNG
  url(): Promise<string>;
  title(): Promise<string>;
  // ... session persistence, etc.
}
```

Three implementations:
- `StagehandLocalProvider` — default, local Chromium + Stagehand + Claude (used in v0)
- `StagehandBrowserbaseProvider` — cloud browser, set `BROWSER_PROVIDER=browserbase`
- `PlaywrightLocalProvider` — plain Playwright, no AI (selectors only, rarely used)

Select via `BROWSER_PROVIDER` env var.

---

## 4. Extraction Pipeline (spike.ts)

### Overall flow
```
main()
 ├── Restore or establish session (login + Gmail 2FA if needed)
 ├── Step 6:  Navigate to labs → save labs.json (skip if exists)
 ├── Step 6b: extractLabsDocs() → output/labs/*.html
 ├── Step 8:  Save screenshot
 ├── Step 9:  extractVisits() → output/visits/*.html + *.json
 ├── Step 10: extractMedications() → output/medications/medications.html
 ├── Step 11: extractMessages() → output/messages/*.html + *.json
 └── buildIndex() → output/index.html
```

### Key design decisions

**HTML as primary output, JSON as secondary:**  
`pageHtml()` captures the full rendered page content including tables, narrative text, and imaging reports. No schema validation — it never fails. Structured JSON extraction via `extract()` is attempted afterward and is best-effort (fails gracefully for narrative-only documents like radiology reports).

**`ensureLoggedIn()` before each section:**  
A long labs crawl (36 panels × ~15s each) can expire the MyChart session. Before each extraction section, we navigate to the home URL and check whether we landed on the login page. If so, we re-authenticate before proceeding.

**Skip logic:**  
Each section checks whether output files already exist (e.g., any `.html` in `output/labs/`) before running. Forced re-extraction via env vars: `FORCE_LABS=1`, `FORCE_VISITS=1`, `FORCE_MEDS=1`, `FORCE_MSGS=1`.

**UCSF MyChart login is two-step:**  
Username → click Next → password page → Sign In. Any new MyChart target may differ.

---

## 5. HTML Document Format

Each saved `.html` file is a self-contained document:

```html
<!DOCTYPE html>
<html>
<head>
  <style>/* minimal readable CSS */</style>
</head>
<body>
  <div class="meta">
    <strong>Source:</strong> https://ucsfmychart...
    <strong>Extracted:</strong> 2026-04-13T05:55:39Z
  </div>
  <!-- Full innerHTML of the page's <main> element -->
</body>
</html>
```

Content is the `innerHTML` of `main` (or `[role="main"]` or `body` as fallback) — preserving tables, headers, and all structural formatting exactly as MyChart renders it.

---

## 6. Session Persistence

After a successful login:
1. `browser.saveSession()` captures all browser cookies
2. Saved to `output/session.json` with a `savedAt` timestamp
3. Next run: cookies restored → navigate to home → check URL
   - Still on home page → session valid, skip login
   - Redirected to login → session expired, re-authenticate

TTL: 12 hours. Configurable. Delete `output/session.json` to force re-login.

---

## 7. 2FA Handling

**Primary: Gmail IMAP auto-fetch**
```
Agent detects 2FA prompt
  → Selects "send to email" delivery option
  → Connects to Gmail via IMAP (App Password)
  → Polls INBOX for emails matching "verification", "MyChart", from "ucsf/mychart/epic"
  → Skips email headers (SMTP routing IDs can look like 6-digit codes)
  → Extracts 6-digit code from email body using context-aware regex
  → Types code into browser, submits
```

Key bugs fixed (see commit history):
- IMAP `since` filter has timezone/date-only semantics that excluded same-day emails — removed, filter by `envelope.date` in code instead
- SMTP routing IDs in email headers match bare 6-digit regex — skip headers, use context-aware patterns first

**Fallback: File relay**
```bash
echo "123456" > output/2fa.code
```
The spike watches `output/2fa.code` via `fs.watch` + 10s poll.

**Standalone relay: `2fa-relay.ts`**  
Can run alongside the spike as a companion process:
```bash
pnpm tsx src/2fa-relay.ts &
pnpm spike
```

---

## 8. Chat Interface (chat.ts)

```
pnpm chat
  → Reads all output/**/*.html and *.json
  → Strips HTML to text (regex-based, no extra deps)
  → Builds system prompt: all records organized by section
  → Calls Anthropic API with streaming
  → Auto-generates opening summary
  → Interactive readline loop
```

Token usage: ~29K tokens for a typical record set (36 labs + 11 visits + 27 messages).  
Model: `claude-sonnet-4-6` (200K context window — fits everything comfortably).

---

## 9. Migration Path to Cloud (Phase 2)

To move from local browser to Browserbase cloud:

1. Set `BROWSER_PROVIDER=browserbase` in `.env`
2. Add `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`
3. The `StagehandBrowserbaseProvider` is already implemented — no other code changes

The orchestration layer continues to run locally. Only the browser runs remotely. 2FA via Gmail auto-fetch continues to work (no debug URL handoff needed since Gmail fetches the code automatically).

For full cloud deployment (no local machine required):
- Deploy orchestration to Railway
- Store credentials securely (never in code or git)
- Output delivery via pre-signed S3/R2 URL
- Session cookies stored in Browserbase Contexts (persistent across sessions)

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
