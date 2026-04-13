# MyChart Agent — Claude Code Instructions

## Project overview

AI agent that logs into Epic MyChart via browser automation, extracts health records, and delivers a zip file. No APIs or FHIR — browser only.

- **PRD:** `PRD.md`
- **Architecture:** `ARCHITECTURE.md`
- **Browser stack research:** `BROWSER_RESEARCH.md`
- **Project plan / roadmap:** `PLAN.md`

## Repository layout

```
browser-agent-team/
├── PLAN.md              # Roadmap and current status — read this first
├── PRD.md               # Product requirements
├── ARCHITECTURE.md      # Technical architecture
├── BROWSER_RESEARCH.md  # Browser stack rationale
└── spike/               # Phase 0 spike (complete)
    ├── src/
    │   ├── spike.ts           # Main spike script
    │   ├── schemas.ts         # Zod schemas for lab data
    │   └── browser/
    │       ├── interface.ts   # BrowserProvider abstraction
    │       ├── index.ts       # Provider factory
    │       └── providers/
    │           ├── stagehand-local.ts    # Stagehand + local Chromium (default)
    │           ├── stagehand-browserbase.ts  # Stagehand + Browserbase cloud
    │           └── playwright-local.ts   # Plain Playwright, no AI
    ├── output/            # Runtime output — gitignored
    │   ├── session.json   # Saved browser session (12h TTL, skip login on reuse)
    │   ├── 2fa.code       # Drop a 6-digit code here to relay 2FA automatically
    │   └── screenshot.png # Last run screenshot
    └── .env               # Credentials — gitignored, see .env.example
```

## Running the spike

```bash
cd spike
pnpm spike
```

Provide 2FA code (when needed):
```bash
echo "123456" > output/2fa.code
```

Delete saved session to force fresh login:
```bash
rm output/session.json
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

### Extraction gap (known)
The labs list page shows panel names + dates but not actual values. Values require clicking into each panel. This is the Phase 1 task.

## Environment variables

See `spike/.env.example`. Key vars:
- `ANTHROPIC_API_KEY` — required for AI browser actions
- `MYCHART_URL` — target MyChart login URL
- `MYCHART_USERNAME` / `MYCHART_PASSWORD` — optional, skips stdin prompts
- `GMAIL_USER` / `GMAIL_APP_PASSWORD` — optional, enables auto-2FA via Gmail IMAP
- `BROWSER_PROVIDER` — `stagehand-local` (default), `browserbase`, or `local`

## Current phase

**Phase 0 (spike) is complete.** See `PLAN.md` for Phase 1 tasks.
