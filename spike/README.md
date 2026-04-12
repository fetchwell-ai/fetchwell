# MyChart Agent — Phase 0 Spike Test

Minimal spike to validate that we can automate MyChart login and extract lab data using the BrowserProvider abstraction.

## Prerequisites

- Node.js 22+
- pnpm
- [Anthropic](https://console.anthropic.com) API key

## Setup

```bash
cd spike
pnpm install
npx playwright install chromium   # install browser for local mode
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY and MYCHART_URL
```

## Run

```bash
pnpm spike
```

That's it. The default mode (`stagehand-local`) opens a visible Chromium window on your machine with full AI-powered browser automation. No Browserbase account needed.

## What to expect

1. A Chromium browser window opens on your screen
2. Navigates to your MyChart URL
3. Prompts for username/password in the terminal (never stored)
4. Stagehand AI fills the login form and submits
5. If 2FA is triggered: you'll see the prompt in the browser window — enter the code there directly
6. Navigates to lab results and extracts structured data via AI
7. Prints extracted JSON to stdout
8. Saves a screenshot to `output/screenshot.png`

## Provider modes

| Mode | Env vars needed | AI actions | Browser |
|------|----------------|------------|---------|
| `stagehand-local` (default) | `ANTHROPIC_API_KEY`, `MYCHART_URL` | Full (act/extract/observe) | Local Chromium window |
| `browserbase` | + `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` | Full | Cloud browser (debug URL) |
| `local` | `MYCHART_URL` only | None (selectors only) | Local Chromium window |

Switch modes by setting `BROWSER_PROVIDER` in `.env` or inline:

```bash
BROWSER_PROVIDER=browserbase pnpm spike
```

## What to report back

- Did the browser window open and navigate to MyChart?
- Did AI-powered login form filling work?
- Did 2FA detection and manual completion work?
- Did `extract()` return structured lab data? How accurate?
- Any errors or timeouts?
