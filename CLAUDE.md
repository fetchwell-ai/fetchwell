# MyChart Agent — Claude Code Instructions

## Project overview

AI agent that logs into Epic MyChart via browser automation, extracts health records, and delivers a zip file. No APIs or FHIR — browser only.

- **PRD:** `PRD.md` — product requirements, engineering plan, phase roadmap (read this first)
- **Architecture:** `ARCHITECTURE.md` — technical architecture detail
- **Browser stack research:** `BROWSER_RESEARCH.md` — why Stagehand + AISdkClient
- **Handoff:** `handoff.md` — what to do in the current/next session

## Repository layout

```
browser-agent-team/
├── PRD.md               # Product + engineering doc — read first
├── ARCHITECTURE.md      # Technical architecture
├── BROWSER_RESEARCH.md  # Browser stack rationale
├── handoff.md           # Current session handoff notes
├── src/
│   ├── extract/
│   │   ├── index.ts     # Main extraction pipeline (entry point)
│   │   ├── labs.ts      # extractLabsDocs(), extractLabsJson()
│   │   ├── visits.ts    # extractVisits()
│   │   ├── medications.ts  # extractMedications()
│   │   ├── messages.ts  # extractMessages()
│   │   └── helpers.ts   # Shared: slugify, savePageAsHtml, navigateWithRetry, buildIndex
│   ├── auth.ts          # doLogin, ensureLoggedIn, fetchGmailVerificationCode
│   ├── session.ts       # loadSavedSession, saveSession, clearSession
│   ├── chat.ts          # Interactive Claude chat
│   ├── package.ts       # Zip packager (pnpm package)
│   ├── 2fa-relay.ts     # Standalone Gmail IMAP 2FA helper
│   ├── schemas.ts       # Zod schemas (LabPanel, Visit, Medication, Message)
│   ├── imap.ts          # extractVerificationCode()
│   └── browser/
│       ├── interface.ts  # BrowserProvider abstraction
│       ├── index.ts      # Provider factory
│       ├── page-eval.ts  # Shared browser-side eval functions
│       └── providers/
│           ├── stagehand-local.ts    # Stagehand + local Chromium (default)
│           ├── stagehand-browserbase.ts  # Stagehand + Browserbase cloud
│           └── playwright-local.ts   # Plain Playwright, no AI
├── output/              # Runtime output — gitignored
│   ├── session.json     # Saved browser session (12h TTL, skip login on reuse)
│   ├── 2fa.code         # Drop a 6-digit code here to relay 2FA manually
│   └── index.html       # Browsable index of all extracted records
└── .env                 # Credentials — gitignored, see .env.example
```

## Running

```bash
pnpm extract    # Extract all records → output/
pnpm chat       # Interactive Claude chat about records
pnpm package    # Bundle output/ into mychart-YYYY-MM-DD.zip
```

Provide 2FA code manually (when Gmail auto-fetch fails):
```bash
echo "123456" > output/2fa.code
```

Delete saved session to force fresh login:
```bash
rm output/session.json
```

Force re-extraction of a specific section:
```bash
FORCE_LABS=1 pnpm extract
FORCE_MSGS=1 pnpm extract
```

## Key technical decisions

### Stagehand model setup
Stagehand v2.5.8's built-in model whitelist only contains retired Claude 3.7 models. We bypass it using `AISdkClient` from Stagehand + `@ai-sdk/anthropic@1.x`:

```typescript
const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const baseModel = anthropic("claude-sonnet-4-6");
// Proxy to inject maxTokens (Stagehand doesn't pass it, causing 4096 truncation)
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

### @ai-sdk/anthropic version
Must be `@1.x` (not `@3.x`). Stagehand uses `ai@4.x` internally which expects AI SDK spec v1. The `@3.x` package implements spec v2 and is incompatible.

### UCSF MyChart login is two-step
Username → click Next → password page → Sign In. Any new MyChart target may differ.

### Session persistence
Cookies saved to `output/session.json` after successful login. Auto-restored on next run (12h TTL). Skips login + 2FA entirely when valid.

### 2FA relay
The spike watches `output/2fa.code` via `fs.watch` + 10s poll fallback. When the file appears, it reads the code and types it into the browser via `act()`.

## Environment variables

See `.env.example`. Key vars:
- `ANTHROPIC_API_KEY` — required for AI browser actions
- `MYCHART_URL` — target MyChart login URL
- `MYCHART_USERNAME` / `MYCHART_PASSWORD` — optional, skips stdin prompts
- `GMAIL_USER` / `GMAIL_APP_PASSWORD` — optional, enables auto-2FA via Gmail IMAP
- `BROWSER_PROVIDER` — `stagehand-local` (default), `browserbase`, or `local`
- `FORCE_LABS`, `FORCE_VISITS`, `FORCE_MEDS`, `FORCE_MSGS` — set to `1` to re-extract that section

## Current phase

**Phase 1 (refactor + stabilize) is complete.** Phase 2 is cloud deployment (Browserbase). See `PRD.md` and `handoff.md`.
