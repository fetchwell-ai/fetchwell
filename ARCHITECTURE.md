# MyChart Health Records Agent — Architecture

## Overview

A TypeScript agent that uses cloud browsers (Browserbase) to navigate Epic MyChart, authenticate as the patient, extract health records, and deliver them as a downloadable zip file. **Runs locally for MVP**, with a clear migration path to Railway for cloud deployment.

**MVP philosophy**: Run locally, no persistent credential storage, no session persistence, no HIPAA over-engineering. The user provides credentials each run, manually enters 2FA codes directly in the live cloud browser, and gets a zip back.

---

## 1. Recommended Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Language** | TypeScript (Node.js) | Best ecosystem for browser automation (Stagehand); single language for agent + API |
| **Cloud browser** | Browserbase (Developer plan) | Stagehand-native; stealth mode; captcha solving; session replay; **interactive live view for 2FA** |
| **AI agent framework** | Anthropic SDK + tool-use loop | Direct Claude API with tool-use; no LangChain overhead |
| **AI browser layer** | Stagehand (cloud mode via Browserbase) | Deterministic Playwright for known flows + AI fallback for dynamic UI; Zod-based extraction |
| **Credentials** | User-provided per run (ephemeral, in-memory only) | Simplest; nothing to breach |
| **2FA handling** | Browserbase live debug URL — user types code directly in cloud browser | No relay code needed; user interacts with the real MyChart 2FA page |
| **File delivery** | Zip file served locally (MVP) or via pre-signed R2 URL (Railway) | Agent builds zip; user downloads |
| **API layer** | Hono | Lightweight, TypeScript-native; same code runs local and on Railway |
| **Runtime** | Local Node.js (MVP) → Railway (fast-follow) | Develop and run locally first; containerize for Railway when ready |
| **Package manager** | pnpm | Fast, disk-efficient |

---

## 1.1 System Block Diagram

```
┌───────────────────────────────────────────────────────��─────────────────┐
│                         Developer's Machine                              │
│                                                                          │
│  ┌────────────────┐                                                      │
│  │ Terminal / CLI  │                                                     │
│  │                 │  POST /sync {creds, types}                          │
│  │  $ pnpm dev     │────────────────────┐                                │
│  │                 │                    │                                │
│  │  Downloads zip  │◀──────────┐        │                                │
│  └────────────────┘           │        │                                │
│                                │        ▼                                │
│  ┌────────────────┐   ┌──────────────────────────────────────────────┐  │
│  │ User's Browser  │   │           Local Node.js Process              │  │
│  │                 │   │                                              │  │
│  │ Opens debug URL │   │  ┌──────────────┐    ┌───────────────────┐  │  │
│  │ to type 2FA     │   │  │ API Service   │    │ Agent Worker       │  │  │
│  │ code directly   │   │  │ (Hono)        │───▶│ (Claude SDK +      │  │  │
│  │ in cloud browser│   │  │               │◀───│  BrowserProvider)  │  │  │
│  │                 │   │  │ /sync         │    │                   │  │  │
│  └───────┬─────────┘   │  │ /job/:id      │    │ Extracts records  │  │  │
│          │              │  │ /download     │    │ Builds zip        │  │  │
│          │              │  └──────┬───────┘    └────────┬──────────┘  │  │
│          │              │         │ Serve zip           │              │  │
│          │              │         ▼                     │              │  │
│          │              │  ┌─────────────┐              │              │  │
│          │              │  │ /tmp (zip)   │              │              │  │
│          │              │  └─────────────┘              │              │  │
│          │              └──────────────────────────────────────────────┘  │
└──────────┼──────────────────────────────────────────────┼────────────────┘
           │                                              │
           │ HTTPS (debug URL)                            │ HTTPS (API calls)
           │                                              │
           ▼                                              ▼
┌──────────────────────────┐              ┌──────────────────────────────┐
│   Browserbase             │              │     Anthropic API            │
│   (Cloud Browser)         │              │     (Claude Sonnet 4.6)      │
│                           │              │                              │
│  ┌─────────────────────┐ │              │  Tool-use loop:              │
│  │ Live Browser Session │ │    HTTPS     │  - Receives page context     │
│  │                      │─┼────────────▶│  - Decides next action       │
│  │ • Agent controls via │ │             │  - Returns tool calls        │
│  │   Stagehand API      │ │              └──────────────────────────────┘
│  │ • User sees/types    │ │
│  │   via debug URL      │ │
│  │ • Navigates MyChart  │─┼────────▶ Epic MyChart (HTTPS)
│  └─────────────────────┘ │
│                           │
│  debuggerFullscreenUrl ───┼────▶ User's browser (interactive 2FA)
│  Session replay     ──────┼────▶ Post-run debugging
└──────────────────────────┘
```

**Key data flows:**
- **Credentials**: User → Local API → Stagehand `fill()` → Browserbase session → MyChart login form (all TLS)
- **2FA code**: Browserbase debug URL → User's browser → User types directly into MyChart 2FA page in the live cloud browser
- **Health records**: MyChart pages → Stagehand `extract()` → Local `/tmp` → Zip → User downloads from localhost
- **AI reasoning**: Page context → Anthropic API → Tool call decisions → Stagehand executes in Browserbase

---

## 1.2 Sync Job Flow Chart

```
                              ┌─────────────────┐
                              │  User triggers   │
                              │  POST /sync      │
                              │  {url, user,     │
                              │   pass, types}   │
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │ Create job,      │
                              │ create Browser-  │
                              │ base session     │
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │ Get debug URL    │
                              │ bb.sessions      │
                              │ .debug(id)       │
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │ Print debug URL  │
                              │ to terminal /    │
                              │ return in API    │
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │ Navigate to      │
                              │ MyChart login    │
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │ Fill username +  │
                              │ password via     │
                              │ Stagehand fill() │
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │ Click sign-in    │
                              └────────┬─────────┘
                                       │
                                       ▼
                           ┌──────────────────────┐
                           │ 2FA prompt detected?  │
                           └───┬──────────────┬────┘
                           Yes │              │ No
                               ▼              │
                  ┌──────────────────────┐    │
                  │ PAUSE agent.         │    │
                  │ Notify user:         │    │
                  │ "Open debug URL and  │    │
                  │  enter your 2FA code │    │
                  │  in the browser"     │    │
                  └──────────┬───────────┘    │
                             │                │
                             ▼                │
                  ┌──────────────────────┐    │
                  │ Poll page for 2FA    │    │
                  │ completion (check if │    │
                  │ login succeeded or   │    │
                  │ dashboard loaded)    │    │
                  │                      │    │
                  │ Timeout: 5 minutes   │    │
                  └──────┬─────────┬─────┘    │
                  Success│         │Timeout    │
                         │         ▼           │
                         │  ┌────────────┐     │
                         │  │ FAIL: 2FA  │     │
                         │  │ timeout.   │     │
                         │  │ Destroy    │     │
                         │  │ session.   │     │
                         │  │ Return err │     │
                         │  └────────────┘     │
                         │                     │
                         ▼                     ▼
                  ┌──────────────────────────────┐
                  │ Verify login success          │
                  │ (check for dashboard/landing) │
                  └──────┬──────────────┬────────┘
                  Success│              │Failure
                         │              ▼
                         │     ┌────────────────┐
                         │     │ FAIL: Login     │
                         │     │ failed. Destroy │
                         │     │ session. Return │
                         │     │ error + reason  │
                         │     └────────────────┘
                         ▼
              ┌─────────────────────┐
              │ For each requested  │
              │ record type:        │◀──────────────┐
              └──────────┬──────────┘               │
                         │                          │
                         ▼                          │
              ┌─────────────────────┐               │
              │ Navigate to section │               │
              │ (labs for MVP)      │               │
              └──────────┬──────────┘               │
                         │                          │
                         ▼                          │
              ┌─────────────────────┐               │
              │ Extract records via │               │
              │ Stagehand extract() │               │
              │ with Zod schema     │               │
              └──────────┬──────────┘               │
                         │                          │
                         ▼                          │
              ┌─────────────────────┐               │
              │ Save JSON to temp   │               │
              │ dir. Download PDFs  │               │
              │ if available.       │               │
              └──────────┬──────────┘               │
                         │                          │
                         ▼                          │
              ┌─────────────────────┐    Yes        │
              │ More record types?  │───────────────┘
              └──────────┬──────────┘
                         │ No
                         ▼
              ┌─────────────────────┐
              │ Build zip from      │
              │ temp directory      │
              │ (archiver)          │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ Destroy Browserbase │
              │ session             │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ Serve zip at        │
              │ /download/{jobId}   │
              │                     │
              │ Return download URL │
              │ to user             │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ DONE                │
              │ Clean up temp files │
              │ after download or   │
              │ timeout (1 hour)    │
              └─────────────────────┘
```

---

## 2. MVP: Local Development Runtime

### How It Works

The agent runs as a local Node.js process on the developer's machine. Browserbase is the only cloud dependency — it provides the browser session via API. Everything else runs locally.

### Local Dev Setup

```bash
# Prerequisites
node >= 22
pnpm >= 9

# Setup
git clone <repo>
cd mychart-agent
pnpm install
cp .env.example .env
# Edit .env with your API keys:
#   ANTHROPIC_API_KEY=sk-ant-...
#   BROWSERBASE_API_KEY=bb_...
#   BROWSERBASE_PROJECT_ID=...
#   BROWSER_PROVIDER=stagehand-local  # "browserbase" for cloud, "stagehand-local" for local AI, "local" for no AI

# Run
pnpm dev   # starts Hono on http://localhost:3000
```

### Local Sync Flow

```
1. User calls POST /sync with MyChart URL, username, password, record types
2. Agent creates Browserbase session + retrieves debug URL
3. Agent prints: "Open this URL to monitor (and enter 2FA): <debuggerFullscreenUrl>"
4. Agent navigates to MyChart login, enters credentials via Stagehand fill()
5. MyChart sends 2FA code to user's email
6. Agent detects 2FA prompt, pauses, notifies user:
   "2FA required — open the debug URL and type your verification code directly in the browser"
7. User opens debug URL in their browser, sees the live MyChart 2FA page, types code
8. Agent detects login completion (polls for dashboard), resumes
9. Agent navigates record sections, extracts data via Stagehand
10. Records collected to /tmp, zipped
11. Zip served at http://localhost:3000/download/{jobId}
12. User downloads zip; temp files cleaned up
```

### In-Process Architecture (MVP)

For single-user local use, skip the job queue. API and worker run in the same process:

```typescript
// src/index.ts — single entry point
import { Hono } from 'hono';
import { runSyncJob } from './agent/worker';

const app = new Hono();
const jobs = new Map<string, JobState>();

app.post('/sync', async (c) => {
  const jobId = crypto.randomUUID();
  const payload = await c.req.json();
  jobs.set(jobId, { status: 'running' });

  // Run agent in background (same process)
  runSyncJob(jobId, payload, jobs);

  return c.json({ jobId, debugUrl: jobs.get(jobId)?.debugUrl });
});

// ... status, download endpoints
```

This same code structure deploys to Railway — the only change is adding a Redis-backed queue when you need to separate API and worker into distinct services.

---

## 3. Credentials & Authentication

### Ephemeral, Per-Run Credentials

The user provides MyChart credentials at the start of each sync. **Nothing is persisted.**

```
1. User submits sync request with: MyChart URL, username, password, record types
2. Credentials held in memory only for duration of the sync job
3. Passed to Stagehand → Browserbase session via fill() calls
4. Cleared from memory when job completes (success or failure)
5. Never written to disk, database, logs, or environment variables
```

### Security Principles

1. **Credentials exist only in memory** during the sync job
2. **TLS 1.3** for all external API calls (Browserbase, Anthropic)
3. **No logging of credentials** — sanitize all log output
4. **Browser session destroyed** immediately after sync
5. **Locally served** — credentials never leave the machine (except to Browserbase session via TLS)

> **Railway migration note**: When deployed to Railway, credentials transit from user's browser → Railway service → Browserbase, all over TLS. For persistent credential storage later, insert AWS Secrets Manager or Browserbase Credential Vault between the API and the agent — the agent code doesn't change.

---

## 4. 2FA Handling

### MVP: Browserbase Debug URL (Human-in-the-Loop)

The user types their 2FA code **directly into the live cloud browser** via Browserbase's interactive debug URL. No WebSocket relay, no code forwarding — the user interacts with the real MyChart 2FA page.

#### How It Works

```
1. Agent creates Browserbase session
2. Agent retrieves interactive debug URL:
      const debugInfo = await bb.sessions.debug(session.id);
      const debugUrl = debugInfo.debuggerFullscreenUrl;
3. Agent navigates to MyChart, fills credentials, submits login
4. MyChart sends 2FA code to user's email
5. Agent detects 2FA prompt on page, pauses navigation
6. Agent notifies user (terminal output / API response):
      ┌─────────────────────────────────────────────────────────┐
      │  2FA required. Open this URL in your browser and enter  │
      │  the verification code directly in the MyChart page:    │
      │                                                         │
      │  https://www.browserbase.com/devtools/live/abc123...    │
      └─────────────────────────────────────────────────────────┘
7. User opens URL → sees the live MyChart 2FA page in their browser
8. User types 2FA code directly into the MyChart input field, clicks submit
9. Agent polls the page for login completion (dashboard loaded, URL changed)
10. Agent detects success, resumes record extraction
```

#### Implementation

```typescript
// src/worker/tools/twofa.ts
import Browserbase from '@browserbasehq/sdk';

const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });

async function handle2FA(sessionId: string, jobId: string): Promise<void> {
  // Get interactive debug URL
  const debugInfo = await bb.sessions.debug(sessionId);
  const debugUrl = debugInfo.debuggerFullscreenUrl;

  // Notify user to open the debug URL
  console.log(`\n🔐 2FA required for job ${jobId}`);
  console.log(`   Open this URL and enter your code in the browser:`);
  console.log(`   ${debugUrl}\n`);

  // Also update job state so API can return it
  updateJobStatus(jobId, { status: '2fa_required', debugUrl });

  // Poll for login completion (user will type code in the live browser)
  await pollForLoginComplete(page, {
    timeout: 300_000,  // 5 minutes
    interval: 2_000,   // check every 2 seconds
  });
}

async function pollForLoginComplete(page: Page, opts: PollOptions): Promise<void> {
  const deadline = Date.now() + opts.timeout;
  while (Date.now() < deadline) {
    // Check if we've left the 2FA/login page
    const url = page.url();
    const title = await page.title();
    if (isMyChartDashboard(url, title)) return;

    // Check for error states
    const error = await page.$('.login-error, .error-message');
    if (error) throw new Error('Login failed after 2FA');

    await new Promise(r => setTimeout(r, opts.interval));
  }
  throw new Error('2FA timeout — user did not enter code within 5 minutes');
}
```

#### Detecting Login Success: `isMyChartDashboard()`

The `pollForLoginComplete` function needs to know when the user has successfully entered 2FA and landed on the MyChart dashboard. This detection must be tuned per health system since MyChart deployments vary, but there are common patterns:

```typescript
// src/worker/tools/twofa.ts

/**
 * Heuristic detection of a logged-in MyChart dashboard.
 * MyChart deployments vary by health system, but share common patterns.
 * This will need tuning per target institution.
 */
function isMyChartDashboard(url: string, title: string): boolean {
  const urlLower = url.toLowerCase();
  const titleLower = title.toLowerCase();

  // URL patterns seen across Epic MyChart deployments
  const dashboardUrlPatterns = [
    '/mychart/home',
    '/mychart/dashboard',
    '/mychart/default.asp',
    '/mychart/inside.asp',
    '/mychart/activity',
  ];

  // Title patterns (MyChart shows patient name or "MyChart - Home" after login)
  const dashboardTitlePatterns = [
    'mychart - home',
    'my chart - home',
    'welcome',
    'health summary',
    'test results',       // some systems land on results
  ];

  const urlMatch = dashboardUrlPatterns.some(p => urlLower.includes(p));
  const titleMatch = dashboardTitlePatterns.some(p => titleLower.includes(p));

  // Also check we've left the login/2FA pages
  const leftLogin = !urlLower.includes('/mychart/authentication')
    && !urlLower.includes('/mychart/login')
    && !urlLower.includes('/mychart/accesscheck');

  return (urlMatch || titleMatch) && leftLogin;
}
```

**Fallback: Stagehand `observe()`**

If heuristic detection fails for a particular health system, use Stagehand's AI to assess the page:

```typescript
async function isMyChartDashboardAI(stagehand: Stagehand): Promise<boolean> {
  const observation = await stagehand.observe(
    'Is this a logged-in patient dashboard or portal home page? ' +
    'Look for navigation menus, patient name, health summary sections, ' +
    'or appointment/message links. Not a login page or 2FA prompt.'
  );
  return observation.length > 0; // observe() returns elements matching the description
}
```

This AI fallback costs one extra LLM call per poll iteration, so use it only after the heuristic check returns false — e.g., after 30 seconds of heuristic-only polling, add the AI check every other iteration.

**Per-institution tuning**: The heuristic patterns above cover the most common MyChart deployments. For a specific health system, inspect the post-login URL and title once manually (via the Browserbase debug URL), then add the exact patterns. The `config.json` could also accept custom `dashboardUrlPattern` and `dashboardTitlePattern` overrides.

#### Why Debug URL, Not WebSocket Relay

| | Debug URL (chosen) | WebSocket relay |
|---|---|---|
| **Code complexity** | ~20 lines (get URL, poll for completion) | ~100+ lines (WS server, client, message protocol) |
| **User experience** | Types in the real MyChart page | Types in our custom UI, code gets relayed |
| **Reliability** | User interacts with actual page; no relay bugs | Message ordering, reconnection, timeout sync |
| **Works on Railway** | Yes — URL is a Browserbase URL, not localhost | Needs keepalive pings, proxy-aware config |
| **Captcha handling** | User can solve captchas too | Can't relay captchas |
| **Dependencies** | None extra | `ws` package, client-side JS |

#### Edge Cases

- **User doesn't open URL in time**: 5-minute timeout, job fails with clear error
- **MyChart shows captcha**: User solves it in the debug URL (free human-in-the-loop)
- **Multiple 2FA methods**: User picks their method directly in the live browser
- **Session expires**: Browserbase sessions last up to 6 hours on Developer plan

### Future: Automated 2FA (Phase 4)

Upgrade path for hands-free operation:

| Method | Approach | User Setup Required |
|--------|----------|-------------------|
| **IMAP** | Poll inbox with `imapflow` for MyChart 2FA email | Gmail App Password |
| **Gmail OAuth** | Watch for new messages via Gmail API | OAuth consent flow |
| **TOTP** | Generate codes server-side with `otpauth` | TOTP secret from MyChart |

> **Integration point**: The `handle2FA()` function is the abstraction boundary. MVP opens debug URL + polls; future implementations read the code from email/TOTP and enter it via Stagehand `fill()` — the rest of the agent doesn't change.

---

## 5. Agent Architecture

### Core Loop: Claude Tool-Use Agent

```
┌─────────────────────────────────────────────────┐
│          Claude (Anthropic API)                   │
│   System prompt: MyChart navigation expert        │
│   Tools: browser actions + record extraction      │
└──────────┬──────────────────┬────────────────────┘
           │ tool calls       │ observations
           ▼                  ▲
┌─────────────────────────────────────────────────┐
│            Tool Execution Layer                   │
│                                                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │ Browser    │  │ Record     │  │ 2FA        │ │
│  │ Provider   │  │ Collector  │  │ Handler    │ │
│  │ (abstract) │  │ (extract → │  │ (debug URL │ │
│  │            │  │  temp dir) │  │  + poll)   │ │
│  └──────┬─────┘  └────────────┘  └────────────┘ │
│         │                                        │
│    ┌────┴─────────────────────┐                  │
│    │ StagehandBrowserbase     │  (production)    │
│    │ StagehandLocal           │  (dev, full AI)  │
│    │ PlaywrightLocal          │  (no AI)         │
│    │ <future providers>       │  (Skyvern, etc.) │
│    └──────────────────────────┘                  │
└─────────────────────────────────────────────────┘
```

### Browser Provider Abstraction

The agent never imports Stagehand or Browserbase directly. All browser interaction goes through a `BrowserProvider` interface. Switching browser backends is a config change + a new provider implementation, not a refactor.

#### `BrowserProvider` Interface

```typescript
// src/browser/interface.ts
import { z, ZodSchema } from 'zod';

export interface BrowserProvider {
  /** Navigate to a URL */
  navigate(url: string): Promise<void>;

  /** Perform a high-level action described in natural language (AI-powered) */
  act(instruction: string): Promise<void>;

  /** Extract structured data from the current page using a Zod schema */
  extract<T>(schema: ZodSchema<T>, instruction: string): Promise<T>;

  /** Observe the page and return elements matching a natural language description */
  observe(instruction: string): Promise<ObserveResult[]>;

  /** Take a screenshot, return base64-encoded image */
  screenshot(): Promise<string>;

  /** Fill a form field */
  fill(selector: string, value: string): Promise<void>;

  /** Wait for a condition: navigation, selector, or network idle */
  waitFor(condition: WaitCondition): Promise<void>;

  /** Get an interactive debug URL for human-in-the-loop (e.g. 2FA).
   *  Returns null if the provider doesn't support it. */
  getDebugUrl(): Promise<string | null>;

  /** Get the current page URL */
  url(): Promise<string>;

  /** Get the current page title */
  title(): Promise<string>;

  /** Query a CSS selector, return element handle or null */
  querySelector(selector: string): Promise<ElementHandle | null>;

  /** Destroy the browser session and clean up resources */
  close(): Promise<void>;
}

export interface ObserveResult {
  selector: string;
  description: string;
}

export type WaitCondition =
  | { type: 'navigation' }
  | { type: 'selector'; selector: string; timeout?: number }
  | { type: 'networkIdle'; timeout?: number };

export interface ElementHandle {
  textContent(): Promise<string | null>;
}
```

#### `StagehandBrowserbaseProvider` (MVP)

```typescript
// src/browser/providers/stagehand-browserbase.ts
import { Stagehand } from '@browserbasehq/stagehand';
import Browserbase from '@browserbasehq/sdk';
import { BrowserProvider, WaitCondition, ObserveResult } from '../interface';

export class StagehandBrowserbaseProvider implements BrowserProvider {
  private stagehand!: Stagehand;
  private bb: Browserbase;
  private sessionId!: string;

  constructor() {
    this.bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });
  }

  async init(): Promise<void> {
    this.stagehand = new Stagehand({
      env: 'BROWSERBASE',
      apiKey: process.env.BROWSERBASE_API_KEY!,
      projectId: process.env.BROWSERBASE_PROJECT_ID!,
      modelName: 'claude-sonnet-4-6',
      modelApiKey: process.env.ANTHROPIC_API_KEY!,
    });
    await this.stagehand.init();
    this.sessionId = this.stagehand.browserbaseSessionID!;
  }

  async navigate(url: string) {
    await this.stagehand.page.goto(url, { waitUntil: 'networkidle' });
  }

  async act(instruction: string) {
    await this.stagehand.act(instruction);
  }

  async extract<T>(schema: ZodSchema<T>, instruction: string): Promise<T> {
    return this.stagehand.extract({ instruction, schema });
  }

  async observe(instruction: string): Promise<ObserveResult[]> {
    return this.stagehand.observe(instruction);
  }

  async screenshot(): Promise<string> {
    const buffer = await this.stagehand.page.screenshot();
    return buffer.toString('base64');
  }

  async fill(selector: string, value: string) {
    await this.stagehand.page.fill(selector, value);
  }

  async waitFor(condition: WaitCondition) {
    switch (condition.type) {
      case 'navigation':
        await this.stagehand.page.waitForNavigation();
        break;
      case 'selector':
        await this.stagehand.page.waitForSelector(condition.selector,
          { timeout: condition.timeout ?? 30_000 });
        break;
      case 'networkIdle':
        await this.stagehand.page.waitForLoadState('networkidle');
        break;
    }
  }

  async getDebugUrl(): Promise<string | null> {
    const debug = await this.bb.sessions.debug(this.sessionId);
    return debug.debuggerFullscreenUrl;
  }

  async url() { return this.stagehand.page.url(); }
  async title() { return this.stagehand.page.title(); }

  async querySelector(selector: string) {
    const el = await this.stagehand.page.$(selector);
    if (!el) return null;
    return { textContent: () => el.textContent() };
  }

  async close() {
    await this.stagehand.close();
  }
}
```

#### `PlaywrightLocalProvider` (Dev/Testing)

For local development without Browserbase, or for testing with a visible browser:

```typescript
// src/browser/providers/playwright-local.ts
import { chromium, Browser, Page } from 'playwright';
import { BrowserProvider, WaitCondition, ObserveResult } from '../interface';

export class PlaywrightLocalProvider implements BrowserProvider {
  private browser!: Browser;
  private page!: Page;
  private headless: boolean;

  constructor(opts: { headless?: boolean } = {}) {
    this.headless = opts.headless ?? false;
  }

  async init(): Promise<void> {
    this.browser = await chromium.launch({ headless: this.headless });
    const context = await this.browser.newContext();
    this.page = await context.newPage();
  }

  async navigate(url: string) {
    await this.page.goto(url, { waitUntil: 'networkidle' });
  }

  async act(_instruction: string) {
    // No AI — throw with guidance to use fill/click directly,
    // or integrate a local LLM for act() in the future
    throw new Error(
      'PlaywrightLocalProvider does not support AI-powered act(). ' +
      'Use fill() and direct selectors, or switch to browserbase provider.'
    );
  }

  async extract<T>(_schema: ZodSchema<T>, _instruction: string): Promise<T> {
    // No AI extraction — could be implemented with local LLM or
    // page.evaluate() + manual parsing for testing
    throw new Error(
      'PlaywrightLocalProvider does not support AI-powered extract(). ' +
      'Switch to browserbase provider for production use.'
    );
  }

  async observe(_instruction: string): Promise<ObserveResult[]> {
    throw new Error('PlaywrightLocalProvider does not support observe().');
  }

  async screenshot(): Promise<string> {
    const buffer = await this.page.screenshot();
    return buffer.toString('base64');
  }

  async fill(selector: string, value: string) {
    await this.page.fill(selector, value);
  }

  async waitFor(condition: WaitCondition) {
    switch (condition.type) {
      case 'navigation':
        await this.page.waitForNavigation();
        break;
      case 'selector':
        await this.page.waitForSelector(condition.selector,
          { timeout: condition.timeout ?? 30_000 });
        break;
      case 'networkIdle':
        await this.page.waitForLoadState('networkidle');
        break;
    }
  }

  async getDebugUrl(): Promise<string | null> {
    // No remote debug URL — user sees the local browser window directly
    return null;
  }

  async url() { return this.page.url(); }
  async title() { return this.page.title(); }

  async querySelector(selector: string) {
    const el = await this.page.$(selector);
    if (!el) return null;
    return { textContent: () => el.textContent() };
  }

  async close() {
    await this.browser.close();
  }
}
```

**Note**: `PlaywrightLocalProvider` does not support AI-powered `act()`, `extract()`, or `observe()` — those are Stagehand features. This provider is for:
- Testing login/navigation flows with known selectors
- Local debugging with a visible browser window
- Fallback if Browserbase is down (for deterministic-only flows)

For full AI capabilities locally, use `StagehandLocalProvider` below.

#### `StagehandLocalProvider` (Dev/Testing with AI)

Stagehand can run against a local Playwright browser without Browserbase — full AI-powered `act()`/`extract()`/`observe()` with no cloud browser dependency. This is the most useful dev/testing option.

```typescript
// src/browser/providers/stagehand-local.ts
import { Stagehand } from '@browserbasehq/stagehand';
import { BrowserProvider, WaitCondition, ObserveResult } from '../interface';

export class StagehandLocalProvider implements BrowserProvider {
  private stagehand!: Stagehand;
  private headless: boolean;

  constructor(opts: { headless?: boolean } = {}) {
    this.headless = opts.headless ?? false;
  }

  async init(): Promise<void> {
    this.stagehand = new Stagehand({
      env: 'LOCAL',
      modelName: 'claude-sonnet-4-6',
      modelApiKey: process.env.ANTHROPIC_API_KEY!,
      headless: this.headless,
    });
    await this.stagehand.init();
  }

  // navigate, act, extract, observe, fill, waitFor, url, title, querySelector, close
  // — all identical to StagehandBrowserbaseProvider (delegates to this.stagehand)

  async navigate(url: string) {
    await this.stagehand.page.goto(url, { waitUntil: 'networkidle' });
  }
  async act(instruction: string) { await this.stagehand.act(instruction); }
  async extract<T>(schema: ZodSchema<T>, instruction: string): Promise<T> {
    return this.stagehand.extract({ instruction, schema });
  }
  async observe(instruction: string): Promise<ObserveResult[]> {
    return this.stagehand.observe(instruction);
  }
  async screenshot(): Promise<string> {
    return (await this.stagehand.page.screenshot()).toString('base64');
  }
  async fill(selector: string, value: string) {
    await this.stagehand.page.fill(selector, value);
  }
  async waitFor(condition: WaitCondition) { /* same as other providers */ }
  async url() { return this.stagehand.page.url(); }
  async title() { return this.stagehand.page.title(); }
  async querySelector(selector: string) {
    const el = await this.stagehand.page.$(selector);
    if (!el) return null;
    return { textContent: () => el.textContent() };
  }

  async getDebugUrl(): Promise<string | null> {
    return null; // User sees the local browser window directly
  }

  async close() { await this.stagehand.close(); }
}
```

**When to use which provider:**

| Provider | AI features | Browser | Debug URL | Use case |
|----------|------------|---------|-----------|----------|
| `StagehandBrowserbaseProvider` | Full | Cloud (Browserbase) | Yes | Production, cloud deployment |
| `StagehandLocalProvider` | Full | Local Chromium | No (visible window) | **Dev/testing — recommended default** |
| `PlaywrightLocalProvider` | None | Local Chromium | No (visible window) | Deterministic-only flows, no LLM cost |

#### Provider Factory

```typescript
// src/browser/index.ts
import { BrowserProvider } from './interface';
import { StagehandBrowserbaseProvider } from './providers/stagehand-browserbase';
import { StagehandLocalProvider } from './providers/stagehand-local';
import { PlaywrightLocalProvider } from './providers/playwright-local';

export type ProviderType = 'browserbase' | 'stagehand-local' | 'local';

export async function createBrowserProvider(
  type?: ProviderType
): Promise<BrowserProvider> {
  const providerType = type ?? (process.env.BROWSER_PROVIDER as ProviderType) ?? 'browserbase';
  const headless = process.env.HEADLESS !== 'false';

  let provider: BrowserProvider & { init(): Promise<void> };

  switch (providerType) {
    case 'browserbase':
      provider = new StagehandBrowserbaseProvider();
      break;
    case 'stagehand-local':
      provider = new StagehandLocalProvider({ headless });
      break;
    case 'local':
      provider = new PlaywrightLocalProvider({ headless });
      break;
    default:
      throw new Error(`Unknown browser provider: ${providerType}`);
  }

  await provider.init();
  return provider;
}

export { BrowserProvider } from './interface';
```

#### Agent Consumes Only the Interface

```typescript
// src/worker/agent.ts — the agent NEVER imports Stagehand or Browserbase
import { BrowserProvider } from '../browser';
import { z } from 'zod';

const LabResultSchema = z.object({
  testName: z.string(),
  value: z.string(),
  units: z.string(),
  referenceRange: z.string(),
  date: z.string(),
});

async function extractLabs(browser: BrowserProvider): Promise<LabResult[]> {
  await browser.navigate('https://mychart.example.org/MyChart/TestResults');
  await browser.waitFor({ type: 'networkIdle' });

  const labs = await browser.extract(
    z.array(LabResultSchema),
    'Extract all lab test results from this page including test name, value, units, reference range, and date'
  );

  return labs;
}
```

```typescript
// src/worker/index.ts — provider injected, not imported
import { createBrowserProvider } from '../browser';

async function runSyncJob(jobId: string, payload: SyncPayload) {
  const browser = await createBrowserProvider();
  // BROWSER_PROVIDER=browserbase → StagehandBrowserbaseProvider
  // BROWSER_PROVIDER=local      → PlaywrightLocalProvider

  try {
    await login(browser, payload.credentials);
    const labs = await extractLabs(browser);
    const zipPath = await buildZip(jobId, { labs });
    return { zipPath };
  } finally {
    await browser.close();
  }
}
```

### Tool Definitions

The Claude agent's tools map directly to `BrowserProvider` methods:

| Tool | Maps To | Description |
|------|---------|-------------|
| `navigate(url)` | `browser.navigate(url)` | Navigate to a URL |
| `click(instruction)` | `browser.act(instruction)` | AI-powered click/interaction |
| `fill(selector, value)` | `browser.fill(selector, value)` | Fill a form field |
| `extract(schema, instruction)` | `browser.extract(schema, instruction)` | Extract structured data with Zod |
| `screenshot()` | `browser.screenshot()` | Capture page state for Claude |
| `wait(condition)` | `browser.waitFor(condition)` | Wait for navigation/element/network |
| `save_record(data, type, filename)` | N/A (file I/O) | Write record to temp directory |
| `download_file(url, filename)` | N/A (file I/O) | Download file from MyChart |
| `handle_2fa()` | `browser.getDebugUrl()` + polling | Surface debug URL, poll for completion |

### Project File Structure

```
src/
├── browser/                # Browser provider abstraction
│   ├── interface.ts        # BrowserProvider interface + types
│   ├── index.ts            # createBrowserProvider() factory
│   └── providers/
│       ├── stagehand-browserbase.ts  # Production: Stagehand + Browserbase cloud
│       ├── stagehand-local.ts        # Dev/testing: Stagehand + local Chromium (full AI)
│       └── playwright-local.ts       # Deterministic-only: local Chromium (no AI)
├── api/                    # API service (Hono routes)
│   ├── index.ts            # Hono app setup
│   ├── routes/
│   │   ├── sync.ts         # POST /sync
│   │   ├── status.ts       # GET /job/:id/status (includes debugUrl when 2FA required)
│   │   └── download.ts     # GET /job/:id/download
│   └── middleware/
│       └── sanitize.ts     # Strip credentials from logs
├── worker/                 # Agent worker (Claude SDK — no browser imports)
│   ├── index.ts            # Job processor: creates provider, runs agent
│   ├── agent.ts            # Claude tool-use loop (consumes BrowserProvider)
│   ├── tools/              # Tool implementations
│   │   ├── browser.ts      # Tools that delegate to BrowserProvider methods
│   │   ├── records.ts      # save_record, download_file
│   │   └── twofa.ts        # handle_2fa (getDebugUrl + poll)
│   └── zip.ts              # Zip builder
├── shared/                 # Shared types, config, interfaces
│   ├── types.ts
│   ├── config.ts           # Reads from env vars (BROWSER_PROVIDER, etc.)
│   └── queue.ts            # JobQueue interface (in-memory local, BullMQ on Railway)
└── index.ts                # Entry point: starts API, wires up in-process queue
```

**Key abstractions** (both follow the same pattern):
- `browser/index.ts` → `createBrowserProvider()` — selected via `BROWSER_PROVIDER` env var
- `shared/queue.ts` → `createQueue()` — selected via `REDIS_URL` env var

### Adding a New Browser Provider

Three providers ship out of the box (`browserbase`, `stagehand-local`, `local`). To add Skyvern, Steel, or any other backend:

1. Create `src/browser/providers/skyvern.ts` implementing `BrowserProvider`
2. Add `'skyvern'` case to `createBrowserProvider()` in `src/browser/index.ts`
3. Set `BROWSER_PROVIDER=skyvern` in env
4. No changes to agent code, tools, or API

### Why Not LangChain / Not Computer Use

- **Not LangChain**: Overhead without benefit for single-purpose agent; Anthropic SDK suffices
- **Not Computer Use**: Screenshot-based loop is slower, more expensive, less precise than DOM-level providers

---

## 6. File Delivery

### MVP: Local Zip Download

Agent collects records, builds zip, serves it on localhost.

```
Job completes → zip built in /tmp → served at localhost:3000/download/{jobId}
                                     (available until process exits or cleanup timer)
```

### Zip Structure

**MVP (Phase 1 — labs only):**
```
mychart-export-2026-04-12/
├── summary.json                     # Export metadata
└── labs/
    ├── 2025-06-15_cbc.json          # Structured lab data
    ├── 2025-06-15_cbc.pdf           # PDF if available from MyChart
    └── 2025-03-10_metabolic.json
```

**Phase 3+ (additional record types added as directories):**
```
mychart-export-2026-04-12/
├── summary.json
├── labs/
│   └── ...
├── medications/                     # Phase 3
│   ├── current.json
│   └── history.json
├── visits/                          # Phase 3
│   ├── 2025-07-20_primary-care.json
│   └── 2025-07-20_primary-care.pdf
├── messages/                        # Phase 3
│   └── 2025-08-01_dr-smith.json
├── immunizations.json               # Phase 3
├── allergies.json                   # Phase 3
├── vitals.json                      # Phase 3
└── documents/                       # Phase 3
    └── 2025-05-12_radiology-report.pdf
```

### `summary.json`

```json
{
  "exported_at": "2026-04-12T15:30:00Z",
  "mychart_url": "https://mychart.example.org",
  "record_types": ["labs"],
  "record_counts": { "labs": 12 },
  "errors": []
}
```

### File Formats

1. **JSON** (primary) — `{ record_date, type, source, data }`, FHIR-compatible where applicable
2. **PDF** (secondary) — Downloaded from MyChart's export/print features

> **Railway migration**: Swap local file serving for Cloudflare R2 upload + pre-signed URL. The `zip.ts` module gains an `uploadToR2()` step; API returns the R2 URL instead of a localhost path.

---

## 7. Railway Deployment — Migration Checklist

When you're ready to move from local to cloud, here's exactly what's needed.

### Prerequisites

- [ ] Railway account (Pro plan, $20/mo)
- [ ] Cloudflare account (free tier for R2)

### Step 1: Add a Dockerfile

Railway auto-detects Node.js projects, but a Dockerfile gives full control:

```dockerfile
# Dockerfile (must be capital "D" at repo root)
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-slim AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**Railway-specific notes**:
- Dockerfile must be named with capital "D"
- Railway injects `PORT` env var — Hono must bind to `process.env.PORT || 3000`
- Build logs will show: `"Using detected Dockerfile!"`
- Use `--mount=type=cache` for faster rebuilds if needed

### Step 2: Configure Railway Environment Variables

Set these in Railway dashboard or via CLI:

```
BROWSER_PROVIDER=browserbase
ANTHROPIC_API_KEY=sk-ant-...
BROWSERBASE_API_KEY=bb_...
BROWSERBASE_PROJECT_ID=...
CLOUDFLARE_R2_ACCESS_KEY=...
CLOUDFLARE_R2_SECRET_KEY=...
CLOUDFLARE_R2_BUCKET=mychart-zips
CLOUDFLARE_R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
```

**Railway variable features**:
- Variables are encrypted at rest
- **Sealed variables**: Once sealed, values are hidden in UI and API (use for API keys)
- **Shared variables**: Share across services (e.g., Redis URL between API and worker)
- **Reference variables**: `${{redis.REDIS_URL}}` to auto-inject another service's connection string
- **Local dev**: `railway run pnpm dev` injects Railway env vars into your local process

### Step 3: Split Into Two Services (Optional but Recommended)

For better reliability, separate API and worker:

**Railway Project Structure**:
```
mychart-agent (Railway Project)
├── api (Service 1)        ← runs src/api/index.ts
├── worker (Service 2)     ← runs src/worker/index.ts
└── redis (Service 3)      ← Railway Redis addon, one click
```

**Add Redis**:
- Click "New Service" → "Database" → "Redis" in Railway dashboard
- Railway auto-creates `REDIS_URL` variable
- Share it to API and worker via reference: `${{redis.REDIS_URL}}`

**Swap queue implementation**:
```typescript
// src/shared/queue.ts
import { JobQueue } from './types';

export function createQueue(): JobQueue {
  if (process.env.REDIS_URL) {
    // Railway: use BullMQ
    return new BullMQQueue(process.env.REDIS_URL);
  }
  // Local: in-memory
  return new InMemoryQueue();
}
```

**BullMQ connection gotcha**:
```typescript
// IMPORTANT: Railway Redis requires family: 0 for IPv4/IPv6 compatibility
const connection = {
  host: redisHost,
  port: redisPort,
  family: 0,  // <-- Required on Railway
};
```

### Step 4: Swap File Delivery for R2

```typescript
// src/worker/zip.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

async function deliverZip(zipPath: string, jobId: string): Promise<string> {
  if (process.env.CLOUDFLARE_R2_ENDPOINT) {
    // Railway: upload to R2, return pre-signed URL
    const client = new S3Client({ /* R2 config */ });
    await client.send(new PutObjectCommand({ /* upload */ }));
    return getSignedUrl(client, /* GetObject */, { expiresIn: 3600 });
  }
  // Local: serve from localhost
  return `http://localhost:3000/download/${jobId}`;
}
```

### Step 5: Deploy

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and link
railway login
railway link

# Deploy (or push to linked GitHub repo)
railway up
```

### Migration Checklist Summary

- [ ] Add `Dockerfile` to repo root
- [ ] Ensure Hono binds to `process.env.PORT || 3000`
- [ ] Set environment variables in Railway (seal API keys)
- [ ] Add Redis service in Railway dashboard
- [ ] Add `bullmq` dependency, implement `BullMQQueue` (with `family: 0`)
- [ ] Add R2 upload to `zip.ts` (behind env var check)
- [ ] Create Cloudflare R2 bucket with 24-hour lifecycle rule
- [ ] `railway up` or connect GitHub repo for auto-deploy
- [ ] Test: trigger sync, verify 2FA debug URL accessible from internet, download zip

---

## 8. Local vs Railway: Behavioral Differences

| Concern | Local | Railway | What to Watch |
|---------|-------|---------|---------------|
| **Port** | Hardcoded 3000 | `process.env.PORT` (Railway assigns) | Always use `PORT` env var with fallback |
| **2FA debug URL** | Works — user opens Browserbase URL | Works identically — URL is on Browserbase, not our server | No difference; debug URL is always a Browserbase-hosted URL |
| **HTTP timeout** | No limit | **15 min max** per request | Syncs should complete within 15 min; return jobId immediately, poll for status |
| **File system** | Persistent `/tmp` | **Ephemeral** — wiped on redeploy/restart | Never rely on local files persisting; use R2 for zips on Railway |
| **DNS** | `localhost:3000` | `*.up.railway.app` (HTTPS auto) | Railway provides free HTTPS subdomain |
| **Redis** | Not needed (in-memory queue) | Required for multi-service | BullMQ `family: 0` for IPv4/IPv6 |
| **Secrets** | `.env` file (gitignored) | Railway encrypted variables | Use sealed variables for API keys |
| **Cold start** | None (already running) | ~2-5s | Not an issue for this use case |
| **Concurrent users** | Single user | Multiple (with queue) | In-memory queue doesn't scale; BullMQ does |
| **Debugging** | Full local access, console.log | Railway logs + Browserbase session replay | Session replay is invaluable for debugging cloud browser issues |

**Note**: Unlike WebSocket-based 2FA relay, the debug URL approach has **no behavioral differences** between local and Railway. The URL is always served by Browserbase, so connectivity, timeouts, and interactivity are identical regardless of where the agent runs. This was a key reason to choose this approach.

---

## 9. HIPAA Compliance Notes

### MVP: Accept Risk, Don't Block Future Compliance

| Requirement | Current (MVP) | Future Compliance Path |
|-------------|--------------|----------------------|
| **BAA chain** | Not signed | AWS for infra; Anthropic BAA on Messages API; Browserbase Scale plan |
| **Encryption at rest** | None (ephemeral data) | R2/S3 encryption; Railway sealed variables |
| **Access controls** | Localhost only | Add auth (Cognito/Auth0); IAM per-user isolation |
| **Audit logging** | App logs only | CloudTrail, S3 access logs |
| **Credential storage** | Ephemeral only | AWS Secrets Manager |
| **Persistent storage** | None | S3 permanent prefix + PostgreSQL metadata |

### Architecture Decisions That Enable Compliance Later

1. **Service separation** — can move to AWS ECS/Fargate without rewriting
2. **R2/S3 for delivery** — supports KMS encryption, versioning, access logging
3. **Browserbase** — Scale plan offers HIPAA/SOC 2
4. **Anthropic API** — BAA available for Messages API
5. **No custom encryption** — rely on provider-managed encryption

---

## 10. Prior Art

### mychart-connector (Fan Pier Labs)

**Most directly relevant.** Open-source MCP server: 35+ tools, login + TOTP 2FA, read AND write patient data. Key insight: reverse-engineered MyChart internal APIs (more efficient than browser automation).

**Recommendation**: Study their API approach. If internal API reverse-engineering works, use as primary method with Stagehand browser automation as resilient fallback.

- [Fan Pier Labs GitHub](https://github.com/Fan-Pier-Labs)
- [mychart-connector on MCP Market](https://mcpmarket.com/es/server/mychart-connector)

### Other

- [Epic on FHIR](https://fhir.epic.com/) — Official FHIR APIs (~800 live apps); read-only, USCDI-limited
- [Anthropic Claude for Healthcare](https://www.anthropic.com/news/healthcare-life-sciences) — FHIR agent skill, healthcare connectors (Jan 2026)
- **rancar2/mychart-mcp** — Another MCP-based MyChart connector

---

## 11. Implementation Phases

### Phase 1: Local MVP

- [ ] Project scaffold (TypeScript, pnpm, Hono)
- [ ] BrowserProvider interface + StagehandBrowserbaseProvider implementation
- [ ] PlaywrightLocalProvider for dev/testing (deterministic flows only)
- [ ] MyChart login flow via BrowserProvider
- [ ] 2FA via Browserbase debug URL (pause + poll)
- [ ] Claude agent tool-use loop for navigation
- [ ] Record extraction: labs (single record type for MVP)
- [ ] Zip builder + local file serving
- [ ] Simple API: `POST /sync`, `GET /job/:id/status`, `GET /job/:id/download`
- [ ] Credential sanitization in all logs

### Phase 2: Railway Deployment

- [ ] Add Dockerfile, bind to `PORT` env var
- [ ] Add Redis + BullMQ for job queue (with `family: 0`)
- [ ] Add R2 upload for zip delivery
- [ ] Configure Railway variables (sealed for secrets)
- [ ] Deploy and test end-to-end

### Phase 3: Full Record Types

- [ ] All record types: medications, allergies, visits, messages, immunizations, vitals, documents
- [ ] PDF downloads from MyChart where available
- [ ] Retry logic for flaky navigation steps
- [ ] Session replay integration for debugging

### Phase 4: Automated 2FA

- [ ] Gmail IMAP integration with `imapflow`
- [ ] Gmail OAuth 2.0 flow
- [ ] TOTP support
- [ ] Credential persistence (opt-in, Secrets Manager or Browserbase Vault)

### Phase 5: Non-Technical Users

- [ ] Web dashboard (React/Next.js) consuming the API
- [ ] User accounts (auth provider)
- [ ] Persistent record storage
- [ ] HIPAA compliance: BAAs, encryption, audit logging

---

## 12. Key Dependencies

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "latest",
    "@browserbasehq/stagehand": "latest",
    "@browserbasehq/sdk": "latest",
    "playwright": "latest",
    "hono": "latest",
    "zod": "latest",
    "archiver": "latest"
  },
  "devDependencies": {
    "typescript": "latest",
    "tsx": "latest",
    "@types/node": "latest"
  }
}
```

**Note**: No `ws` package needed for MVP — 2FA uses Browserbase debug URL, not WebSocket relay.

**Added for Railway (Phase 2)**:
```json
{
  "bullmq": "latest",
  "@aws-sdk/client-s3": "latest",
  "@aws-sdk/s3-request-presigner": "latest"
}
```

**Added for automated 2FA (Phase 4)**:
```json
{
  "imapflow": "latest",
  "otpauth": "latest"
}
```

---

## 13. Cost Estimate

### Local MVP: ~$22-25/month

| Component | Cost |
|-----------|------|
| Browserbase Developer ($20/mo, 100 browser hrs — we use < 1 hr) | $20 |
| Anthropic API (Sonnet 4.6, ~4 syncs/mo, ~$0.53/sync with caching) | ~$2-5 |
| Local compute | $0 |
| **Total** | **~$22-25/mo** |

### With Railway: ~$42-45/month

| Component | Cost |
|-----------|------|
| Railway Pro ($20/mo, $20 credit covers compute + Redis) | $20 |
| Browserbase Developer | $20 |
| Anthropic API | ~$2-5 |
| Cloudflare R2 (free tier) | $0 |
| **Total** | **~$42-45/mo** |

---

## 14. Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Epic blocks automated access | Medium | Browserbase stealth mode; human-like timing; fallback to FHIR API |
| MyChart UI changes break navigation | High | Stagehand AI layer adapts; session replay for debugging |
| 2FA timeout (user too slow to open debug URL) | Medium | 5-min timeout with clear prompts; URL printed immediately at job start |
| Credential exposure | Low | Ephemeral only; TLS everywhere; no logging of PII |
| Browserbase debug URL inaccessible | Low | URL is hosted by Browserbase infrastructure; no dependency on our server |
| Browserbase outage | Low | Retry; could fall back to local Playwright for dev |

---

## 15. Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| MVP runtime | Local Node.js | Fastest iteration; no infra to manage; Railway is just containerizing the same code |
| Cloud browser | Browserbase (via `BrowserProvider` abstraction) | Stealth, captcha solving, session replay, debug URL; swappable via env var |
| Credential storage | Ephemeral per-run | User requirement; simplest and most secure |
| 2FA | Browserbase debug URL (user types directly in cloud browser) | Zero relay code; works identically local and cloud; user can also solve captchas |
| File delivery | Local zip (MVP) → R2 (Railway) | Simplest local; R2 free tier for cloud |
| Job queue | In-memory (MVP) → BullMQ + Redis (Railway) | No infra for local; clean swap via `JobQueue` interface |
| Service separation | Logical (same process) → physical (Railway services) | Code structured for separation from day one; split is config, not refactor |
| Hosting migration | Local → Railway | Railway: `git push` deploys, $20/mo, great DX; AWS upgrade path exists for HIPAA |

---

## 16. References

- [Fan Pier Labs mychart-connector](https://github.com/Fan-Pier-Labs) — Prior art: MCP server for MyChart
- [Epic on FHIR](https://fhir.epic.com/) — Official Epic FHIR APIs
- [Stagehand SDK](https://github.com/browserbase/stagehand) — AI browser automation
- [Browserbase](https://www.browserbase.com/) — Cloud browsers with stealth and session replay
- [Browserbase Live View](https://docs.browserbase.com/features/session-live-view) — Interactive debug URL docs
- [Browserbase Session Live URLs API](https://docs.browserbase.com/reference/api/session-live-urls) — `debuggerFullscreenUrl` API
- [Browserbase Pricing](https://www.browserbase.com/pricing) — Developer $20/mo; Scale for HIPAA
- [Railway Docs: Dockerfiles](https://docs.railway.com/builds/dockerfiles) — Dockerfile requirements
- [Railway Docs: Variables](https://docs.railway.com/variables) — Env vars, sealed variables, shared variables
- [Railway Docs: Cron/Workers/Queues](https://docs.railway.com/guides/cron-workers-queues) — Background job patterns
- [Railway Docs: Pricing](https://docs.railway.com/pricing/plans) — Pro plan $20/mo with $20 credit
- [BullMQ Connections](https://docs.bullmq.io/guide/connections) — `family: 0` for Railway Redis
- [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/) — Free tier: 10GB, zero egress
- [Anthropic BAA](https://privacy.claude.com/en/articles/8114513-business-associate-agreements-baa-for-commercial-customers)
- [Anthropic Claude for Healthcare](https://www.anthropic.com/news/healthcare-life-sciences)
- [Browser Automation in Claude Code: 5 Tools Compared](https://www.heyuan110.com/posts/ai/2026-01-28-claude-code-browser-automation/)
- [Stagehand vs Browser Use vs Playwright](https://www.nxcode.io/resources/news/stagehand-vs-browser-use-vs-playwright-ai-browser-automation-2026)
- [The Scrapers At MyChart's Gate](https://healthapiguy.substack.com/p/the-scrapers-at-mycharts-gate)
