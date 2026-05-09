# Spike: iPhone App with Browserbase Cloud Browser

**Date:** 2026-05-08
**Author:** spike research (browser-agent-team-8ou)
**Status:** findings only — no code changes

---

## Summary

Building an iPhone version of FetchWell using Browserbase cloud browsers is architecturally feasible but requires significant new infrastructure. The biggest shift is that all automation logic currently runs in-process on the desktop; an iPhone version requires a server-side runner that FetchWell doesn't currently have. The work is substantial but the path is clear. Estimated effort: 4–6 weeks for a working prototype.

---

## 1. Browserbase Feasibility

**Can we run our pipelines against a remote Browserbase session?**

Yes — with minimal code changes.

Stagehand (currently installed as `@browserbasehq/stagehand@2.5.8`) has first-class Browserbase support built in. Switching from local to cloud is a single constructor flag:

```typescript
// Current (local):
new Stagehand({ env: "LOCAL", llmClient, localBrowserLaunchOptions: { headless: false } })

// Browserbase cloud:
new Stagehand({ env: "BROWSERBASE", apiKey: process.env.BROWSERBASE_API_KEY, projectId: process.env.BROWSERBASE_PROJECT_ID, llmClient })
```

**`act()`, `extract()`, `observe()`** — all work identically against a remote session. The Stagehand API is the same regardless of `env`.

**`page.pdf()`** — Stagehand's `Page` type extends Playwright's `Page` (it is `Omit<Page, "on" | "screenshot">`), so `page.pdf()` is inherited from Playwright. Playwright's `page.pdf()` generates PDFs server-side inside the Chromium process. When that Chromium process is running on Browserbase, the PDF bytes are returned over CDP to the caller. This works — but the PDF buffer is produced on the server side and the bytes must be transferred to the phone.

**`InitResult.debugUrl`** — Stagehand returns `{ debugUrl, sessionUrl, sessionId }` after `init()` in BROWSERBASE mode. `debugUrl` is a Browserbase live-view URL that lets a human watch or interact with the browser in real time — this is the 2FA relay mechanism (described in section 4).

**Latency** — health portal interactions involve many sequential AI calls (observe, act, extract). Each call has a round-trip to the Browserbase Chromium instance plus an LLM inference call. Expect 3–8 seconds per AI action vs. ~1–3 seconds locally. A full extraction run that takes 3–5 minutes locally could take 8–15 minutes over Browserbase. This is acceptable for a background mobile operation but not for interactive use.

**Reliability** — Browserbase runs managed Chromium with anti-detection and residential IP rotation. Health portals (especially Epic MyChart) actively block automated browsers. Browserbase's commercial infrastructure may be more reliable than local Chromium for portal login, but this is unproven for our specific portals.

**Unknown:** Whether Epic MyChart's bot detection triggers on Browserbase IPs. The only way to know is a live test.

---

## 2. iOS App Architecture

**Recommendation: React Native (Expo)**

Three options:

### Option A: SwiftUI native (most control, most effort)
- SwiftUI app communicates with a Vercel/server API via HTTP/WebSocket
- Server runs the Node.js extraction pipeline with Browserbase
- PDF bytes streamed from server to phone
- Effort: 8–12 weeks. Requires a full SwiftUI app from scratch plus server deployment

### Option B: React Native / Expo (recommended prototype path)
- Expo app using React Native; UI can reuse design patterns from the existing React renderer
- Server-side runner (Vercel or dedicated) exposes a REST/SSE API
- The Expo app calls the API, receives progress events (Server-Sent Events), downloads PDFs on completion
- Effort: 4–6 weeks for a working prototype
- Why Expo: faster iteration, no Xcode-first workflow required, existing TypeScript/React skills apply directly

### Option C: Web app wrapped in WKWebView (simplest, most limited)
- Deploy the existing Electron renderer as a web app; wrap it in a WKWebView iOS shell
- No native Keychain, Files app integration is awkward, background execution is severely limited
- Only viable for a demo. Not recommended for production

**Communication between iOS app and Browserbase:**

Browserbase is a cloud service — it has no iOS SDK. The iPhone app does not talk to Browserbase directly. Instead:

```
iPhone app
    │  HTTP POST /run-extraction
    ▼
Server (Node.js — Vercel serverless or dedicated VM)
    │  Stagehand with env="BROWSERBASE"
    ▼
Browserbase cloud Chromium
    │  browses health portal
    ▼
PDFs generated server-side → transferred back → served to iPhone
```

The iPhone app is a thin client. All extraction logic stays in Node.js where it already lives.

---

## 3. File Storage on iOS

**Where do downloaded PDFs live?**

iOS imposes a strict container model. Options:

### App-local Documents directory (simplest)
- Path: `<app>/Documents/`
- Files survive app restarts, show up in **Files app** under the app's folder if `UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace` are set in `Info.plist`
- User can AirDrop, share to Claude.ai, or open in any PDF viewer from Files app
- **This is the right default for a prototype**

### iCloud Drive
- Requires iCloud entitlement and a paid Apple Developer account
- Files sync across devices; available offline after first download
- Additional setup: CloudKit or `NSUbiquitousContainerIdentifier`
- Worth adding in v2, not v1

### Sharing directly from app
- iOS share sheet (`UIActivityViewController` / React Native `Share` API) lets the user send the PDF to any destination immediately — no Files app required
- The user picks Claude.ai Files, Mail, AirDrop, etc.
- **This should be the primary flow:** download → share sheet, with Files app as fallback

**Offline access:** PDFs downloaded to the Documents directory are available offline immediately. Total storage for a typical FetchWell extraction is 2–8 MB. iOS storage constraints are not a practical concern at this scale.

---

## 4. 2FA Relay on Mobile

This is the hardest UX problem in the entire architecture.

**Current desktop behavior:** The Electron app pauses the pipeline subprocess, shows an in-app OTP modal, waits for the user to type a code, then forwards it to the browser via the `ui` two-factor strategy.

**On mobile with a remote browser:** The same pause-and-prompt pattern works, but the phone is the prompt surface instead of the desktop.

**Proposed mobile flow:**

1. Server starts extraction; hits 2FA challenge
2. Server sends a **push notification** to the device (APNs via Firebase FCM or direct APNs) with message: "Enter your 2FA code for Stanford MyChart"
3. iPhone user taps notification → app opens → shows an OTP entry sheet
4. User types code → app POSTs code to server via HTTP
5. Server forwards code to the `ui` 2FA callback → browser continues

**Alternatively (simpler for prototype):** Show the Browserbase `debugUrl` directly in a WKWebView or SafariViewController within the app. The user sees the live browser session and types the 2FA code themselves directly in the remote browser UI. No custom relay needed. This is the path of least resistance for a prototype.

**Alternatively (no-code relay):** If the portal sends 2FA codes by email, the server can auto-fetch them via Gmail IMAP (already implemented in `email` strategy). No mobile prompt needed at all. Stanford MyChart does not use 2FA; UCSF uses email 2FA which the existing `email` strategy handles. For most portals, email auto-fetch eliminates the mobile 2FA relay problem entirely.

---

## 5. Authentication Flow

**Where do portal credentials live on iOS?**

iOS Keychain is the correct answer. Both React Native and SwiftUI provide access:
- React Native: `react-native-keychain` library
- SwiftUI: `Security` framework `SecItemAdd` / `SecItemCopyMatching`

**Flow:**
1. First launch: user enters portal URL, username, password in the app
2. App stores credentials in iOS Keychain (encrypted at rest, tied to app bundle ID)
3. On each extraction run, app reads credentials from Keychain and sends them to the server API in the request body over HTTPS (TLS in transit)
4. Server uses credentials for browser login; does not store them

**Session persistence:** The server can return session cookies to the app after a successful login. The app stores them (encrypted, in Keychain or secure storage) and sends them on the next run, letting the server skip login/2FA when the session is still valid — mirroring the current `session.json` pattern.

**Security risk to assess:** Credentials transit from phone to server over HTTPS. If using Vercel serverless, the server is ephemeral and stateless — credentials are never written to disk. This is acceptable. A dedicated VM requires more care (no credential logging, memory-only).

---

## 6. Stagehand on Server

**Current situation:** Stagehand runs in-process, in the Electron app, on the user's Mac. The `StagehandLocalProvider` launches local Chromium.

**For Browserbase on a server:**

A new server-side entry point is needed. The existing `src/extract/runner.ts` and `src/discover/runner.ts` are already pure functions with no Electron dependency — they can run in any Node.js context. The only changes needed:
- Add a `StagehandBrowserbaseProvider` (parallel to `StagehandLocalProvider`) that passes `env: "BROWSERBASE"` and returns `debugUrl` from `init()`
- Add a REST/SSE server layer (Express or Hono) that accepts extraction requests, runs the pipeline, and streams progress events back

**Deployment options:**

| Option | Pros | Cons |
|---|---|---|
| **Vercel serverless functions** | Zero-ops, free tier generous | 10-second default timeout; extraction takes 5–15 min — requires Pro plan (300s timeout) or serverless streaming with keep-alive pings |
| **Railway / Render (always-on VM)** | No timeout concern, persistent session files | $5–20/month, requires deployment config |
| **Fly.io** | Fast cold start, volume mounts for session files, free tier | More config than Vercel |
| **User's own Mac as server** | Zero cost, local Chromium as fallback | Requires Mac to be on; defeats mobile independence |

**Recommendation for prototype:** Railway or Render. Simple Docker-based deployment, no timeout issues, HTTP/SSE support out of the box.

**Vercel note:** Vercel functions run in Lambda which does not support Playwright's Chromium (binary size + sandbox restrictions). Browserbase sidesteps this — Chromium runs on Browserbase, not on Vercel. So Vercel is viable as an API server, just not for local Chromium.

---

## 7. Cost Model

**Current cost (zero local):**
- Anthropic API: ~$0.05–0.20 per extraction run (Stagehand AI calls for act/extract/observe)
- Chromium: local, free

**Browserbase pricing (as of May 2026):**
- Sessions are billed per concurrent session-minute
- Hobby tier: ~$0.10/minute; Pro: ~$0.08/minute (estimated — check [browserbase.com/pricing](https://www.browserbase.com/pricing) for current rates)
- A full FetchWell extraction (labs + visits + medications + messages): approximately 10–20 minutes of browser session time
- **Cost per extraction run: ~$1.00–2.00** (Browserbase) + $0.05–0.20 (Anthropic) = **$1.05–2.20/run**

**Comparison:** Current desktop cost is $0.05–0.20/run (Anthropic only). Browserbase adds ~$1–2 per run. Over 100 runs/year: $100–200 in Browserbase fees.

**Mitigations:**
- Session persistence (existing mechanism) skips login/2FA on repeat runs, reducing session time per run
- Incremental extraction (existing `--incremental` flag) fetches only new records — fewer pages navigated
- With both optimizations, 3–5 minute session times (saving ~$0.50–1.00/run) are realistic

**Unknown:** Browserbase pricing tiers and whether the Hobby plan has rate limits that would impact a single-user app. Check current pricing before committing.

---

## 8. Offline Access

**PDFs available offline:** Yes, immediately after download. PDFs saved to the app's `Documents/` directory persist on-device and are accessible without network connectivity.

**What requires network:**
- Extraction runs (always — needs Browserbase)
- Session refresh when cookies expire

**What works offline:**
- Viewing previously downloaded PDFs
- Sharing PDFs to Claude.ai (if the share sheet destination is network-connected)

**iOS storage constraints:** Not a practical concern. One full FetchWell extraction produces 4 PDFs totaling 2–8 MB. Even 1,000 runs would be under 8 GB. Free iPhones have 64–128 GB storage.

---

## Architecture Sketch

```
┌─────────────────────────────────────────────────────┐
│  iPhone App (React Native / Expo)                   │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  Portals UI  │  │  Progress UI │  │  PDFs UI   │ │
│  │  (CRUD)      │  │  (SSE stream)│  │  (share)   │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                 │                │        │
│  ┌──────▼─────────────────▼────────────────▼──────┐ │
│  │  FetchWell API Client (HTTPS + SSE)            │ │
│  │  Credentials: iOS Keychain                     │ │
│  │  Downloaded PDFs: Documents/ (Files app)       │ │
│  └────────────────────┬───────────────────────────┘ │
└───────────────────────┼─────────────────────────────┘
                        │ HTTPS
┌───────────────────────▼─────────────────────────────┐
│  FetchWell Server (Node.js — Railway/Render)         │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │  REST/SSE API (Express or Hono)               │   │
│  │  POST /extract  →  run extractProvider()      │   │
│  │  POST /discover →  run discoverProviderById() │   │
│  │  GET  /status   →  SSE progress stream        │   │
│  │  GET  /pdf/:id  →  stream PDF bytes           │   │
│  │  POST /2fa      →  relay OTP to pipeline      │   │
│  └───────────────────────┬──────────────────────┘   │
│                          │                           │
│  ┌───────────────────────▼──────────────────────┐   │
│  │  Existing pipeline (src/extract/runner.ts,    │   │
│  │  src/discover/runner.ts — unchanged)           │   │
│  │  BrowserProvider: StagehandBrowserbaseProvider│   │
│  └───────────────────────┬──────────────────────┘   │
└──────────────────────────┼──────────────────────────┘
                           │ CDP / Playwright
┌──────────────────────────▼──────────────────────────┐
│  Browserbase Cloud Chromium                          │
│  (managed, anti-detection, debugUrl for 2FA)         │
└─────────────────────────────────────────────────────┘
```

---

## Estimated Effort

| Work item | Effort |
|---|---|
| `StagehandBrowserbaseProvider` (new BrowserProvider impl) | 1–2 days |
| Server API layer (Express + SSE progress + PDF serving) | 3–4 days |
| Server deployment config (Railway/Render + env vars) | 1 day |
| React Native / Expo app skeleton (portal CRUD, progress view, PDF list) | 5–7 days |
| iOS Keychain credential storage | 1 day |
| 2FA relay (either debugUrl-in-webview or push notification) | 2–3 days |
| PDF download + Files app integration + share sheet | 1–2 days |
| End-to-end test with Stanford MyChart on Browserbase | 1–2 days |
| **Total prototype** | **~4–6 weeks** |

This estimate assumes one developer, working from scratch on the mobile side. The server-side work builds directly on existing code and is the fastest part.

---

## Blockers and Open Questions

1. **Epic MyChart bot detection on Browserbase IPs** — Unknown. Must test with a live Stanford session. This is the highest-risk unknown. If Browserbase IPs are blocked, the whole approach fails unless Browserbase's residential proxy feature is used (additional cost).

2. **Vercel serverless timeout** — Vercel Pro allows 300-second function timeouts. A 15-minute extraction exceeds this. Must use Railway/Render or break extraction into resumable chunks.

3. **`page.pdf()` over Browserbase** — The Stagehand `Page` type inherits Playwright's `pdf()` method. The implementation depends on Playwright's CDP-based PDF generation, which should work against a remote Chromium. This needs a live test; it is not explicitly documented as supported in Browserbase.

4. **Browserbase pricing** — The cost model estimate is based on public pricing as of early 2026. Verify current rates before committing. At $1–2/run, a power user running extraction weekly would spend ~$50–100/year on Browserbase alone.

5. **iOS App Store distribution** — A standalone iOS app requires an Apple Developer account ($99/year) and App Store review. For a personal-use app, TestFlight distribution avoids the review process but has a 90-day expiry per build. For general distribution, the App Store's health data policies (even though we're not using HealthKit) may require review scrutiny.

6. **Background execution limits** — iOS aggressively terminates background tasks. A 10–15 minute extraction cannot run with the app backgrounded using standard background tasks. Either the user must keep the app foreground, or a VoIP background mode (hacky) or Background App Refresh (max 30 seconds) is needed. The server-side architecture mitigates this: the server runs the extraction, and the iPhone can be backgrounded while waiting for a push notification on completion.

7. **Session cookie storage security** — Storing portal session cookies on-device (to skip re-login) requires careful key management. iOS Keychain handles this correctly, but the server must never log or persist credentials.

---

## Recommendation

The architecture is sound. The biggest decision is whether to invest in this direction at all, given:
- Cost: ~$1–2/run vs. free locally
- Complexity: adds a server deployment that must be maintained
- Risk: unknown Browserbase compatibility with specific health portals

**Recommended next step if pursuing this:** Build a minimal `StagehandBrowserbaseProvider` (1–2 days) and test a live Stanford extraction against Browserbase. This validates the most critical unknowns (bot detection, `page.pdf()`, latency) before committing to the full mobile app build.
