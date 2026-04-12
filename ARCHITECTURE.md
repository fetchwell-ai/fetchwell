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
│  │ code directly   │   │  │ (Hono)        │───▶│ (Stagehand +      │  │  │
│  │ in cloud browser│   │  │               │◀───│  Claude SDK)       │  │  │
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
              │ (labs, meds, etc.)  │               │
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
│  │ Stagehand  │  │ Record     │  │ 2FA        │ │
│  │ + Browser- │  │ Collector  │  │ Handler    │ │
│  │ base Cloud │  │ (extract → │  │ (debug URL │ │
│  │            │  │  temp dir) │  │  + poll)   │ │
│  └────────────┘  └────────────┘  └────────────┘ │
└─────────────────────────────────────────────────┘
```

### Tool Definitions

| Tool | Description |
|------|-------------|
| `navigate(url)` | Navigate Browserbase session to a URL |
| `click(selector_or_description)` | Click element via Stagehand `act()` |
| `fill(selector, value)` | Fill a form field |
| `extract(schema)` | Extract structured data via Stagehand `extract()` with Zod |
| `screenshot()` | Capture page state for Claude to analyze |
| `wait(condition)` | Wait for navigation, element, or network idle |
| `save_record(data, type, filename)` | Write extracted record to job temp directory |
| `download_file(url, filename)` | Download a file (PDF, etc.) from MyChart |
| `handle_2fa()` | Pause agent, surface debug URL, poll for login completion |

### Service Separation (Clean Boundary for Railway)

Even running in one process locally, the code is structured as two logical services:

```
src/
├── api/                    # API service (Hono routes)
│   ├── index.ts            # Hono app setup
│   ├── routes/
│   │   ├── sync.ts         # POST /sync
│   │   ├── status.ts       # GET /job/:id/status (includes debugUrl when 2FA required)
│   │   └── download.ts     # GET /job/:id/download
│   └── middleware/
│       └── sanitize.ts     # Strip credentials from logs
├── worker/                 # Agent worker (Stagehand + Claude SDK)
│   ├── index.ts            # Job processor entry point
│   ├── agent.ts            # Claude tool-use loop
│   ├── tools/              # Tool implementations
│   │   ├── browser.ts      # navigate, click, fill, extract, screenshot, wait
│   │   ├── records.ts      # save_record, download_file
│   │   └── twofa.ts        # handle_2fa (debug URL + poll)
│   └── zip.ts              # Zip builder
├── shared/                 # Shared types, config, job queue interface
│   ├── types.ts
│   ├── config.ts           # Reads from env vars
│   └── queue.ts            # JobQueue interface (in-memory local, BullMQ on Railway)
└── index.ts                # Entry point: starts API, wires up in-process queue
```

**Key**: `shared/queue.ts` exports a `JobQueue` interface. Local MVP uses `InMemoryQueue`; Railway deployment swaps in `BullMQQueue`. No other code changes.

### Why Browserbase / Not LangChain / Not Computer Use

- **Browserbase**: Stealth mode, captcha solving, session replay, **interactive debug URL for 2FA**, Stagehand-native, no browser infra to manage
- **Not LangChain**: Overhead without benefit for single-purpose agent; Anthropic SDK suffices
- **Not Computer Use**: Screenshot-based loop is slower, more expensive, less precise than DOM-level Stagehand

---

## 6. File Delivery

### MVP: Local Zip Download

Agent collects records, builds zip, serves it on localhost.

```
Job completes → zip built in /tmp → served at localhost:3000/download/{jobId}
                                     (available until process exits or cleanup timer)
```

### Zip Structure

```
mychart-export-2026-04-12/
├── summary.json                     # Export metadata
├── labs/
│   ├── 2025-06-15_cbc.json
│   ├── 2025-06-15_cbc.pdf
│   └── 2025-03-10_metabolic.json
├── medications/
│   ├── current.json
│   └── history.json
├── visits/
│   ├── 2025-07-20_primary-care.json
│   └── 2025-07-20_primary-care.pdf
├── messages/
│   └── 2025-08-01_dr-smith.json
├── immunizations.json
├── allergies.json
├── vitals.json
└── documents/
    └── 2025-05-12_radiology-report.pdf
```

### `summary.json`

```json
{
  "exported_at": "2026-04-12T15:30:00Z",
  "mychart_url": "https://mychart.example.org",
  "record_types": ["labs", "medications", "visits", "messages", "immunizations", "allergies", "vitals"],
  "record_counts": { "labs": 12, "medications": 5, "visits": 8 },
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
- [ ] Stagehand + Browserbase: MyChart login flow
- [ ] 2FA via Browserbase debug URL (pause + poll)
- [ ] Claude agent tool-use loop for navigation
- [ ] Record extraction: labs, medications, allergies (3 types to start)
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

- [ ] All record types: visits, messages, immunizations, vitals, documents
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
| Cloud browser | Browserbase | Stealth, captcha solving, session replay, interactive debug URL; Stagehand-native |
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
