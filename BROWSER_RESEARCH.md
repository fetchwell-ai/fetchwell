# Browser Automation Tools Research for AI Agents

**Use Case:** AI agent that navigates Epic MyChart to retrieve health records — including login, 2FA handling, navigation, and file download.

**Date:** 2026-04-12

---

## Executive Summary

> **UPDATE 2026-04-12 (v3):** Revised for MVP constraints: HIPAA risk accepted, manual 2FA entry, no session persistence needed, ephemeral credentials (entered each run, never persisted), zip file output. Cloud-first required.

After evaluating 10+ browser automation tools across 7 criteria and applying MVP constraints, our **primary recommendation is Browserbase + Stagehand**, with **Skyvern as the upgrade path** when HIPAA compliance becomes required.

For an MVP cloud-deployed MyChart agent with manual 2FA, ephemeral credentials, and zip file output:

| Layer | Tool | Why |
|-------|------|-----|
| Cloud browser | **Browserbase** | Most mature cloud browser infra, Contexts for future session persistence, CAPTCHA solving, encrypted at rest |
| AI orchestration | **Stagehand** (by Browserbase) | `act`/`extract`/`observe`/`agent` primitives, native Claude support via Vercel AI SDK, 500k+ weekly downloads |
| Credentials | **Ephemeral (runtime only)** | User provides credentials each run; passed to Stagehand `act()` calls; never persisted |
| File output | **Browserbase Downloads API** | Cloud-stored downloads, accessible via API; agent bundles into zip |
| Future upgrade | **Skyvern** (self-hosted) | When HIPAA/BAA becomes required — already proven on Epic portals, SOC2 Type II |

### Why MVP Constraints Change the Recommendation

The user's MVP constraints remove Skyvern's key advantages and favor Browserbase + Stagehand:

1. **HIPAA risk accepted for MVP.** Skyvern's main differentiator was HIPAA/SOC2/BAA. With compliance deferred, the self-hosted Docker overhead isn't justified. Browserbase's managed infrastructure is faster to ship.

2. **Ephemeral credentials — no storage needed.** User provides MyChart credentials at runtime each session. Credentials are passed directly to Stagehand's `act()` fill calls and never persisted anywhere. Browserbase Contexts remain available for future session/cookie persistence but are not used for credential storage.

3. **Manual 2FA for MVP.** No need for email API integration or TOTP automation. The agent pauses, surfaces a live browser view, user enters the code. Browserbase supports this via session connect/debug URLs. Stagehand's `observe` primitive can detect the 2FA prompt and pause.

4. **No session persistence for MVP.** Removes the need for persistent `userDataDir` or cross-session cookie management. Each run is a fresh session — simpler architecture.

5. **Zip file output.** Browserbase's Downloads API stores files in cloud storage. The orchestration layer bundles them into a zip for the user.

### Path to HIPAA Compliance (Future)

When compliance is needed, migrate to **Skyvern (self-hosted)** on HIPAA-eligible AWS/GCP:
- Skyvern extends Playwright just like Stagehand — similar AI-driven browser primitives
- Add BAA, credential vault (1Password/Bitwarden), encrypted storage
- Session persistence and automated 2FA (Gmail API) come in the same phase
- The agent logic (navigation, extraction, download) ports with moderate effort

---

## Tool-by-Tool Evaluation

### 1. Playwright (Microsoft)

**What it is:** Modern browser automation library. Auto-waiting, browser contexts, multi-language support (Python, JS, .NET, Java). The foundation most AI browser tools build on.

| Criterion | Rating | Notes |
|-----------|--------|-------|
| 2FA handling | **Good** | No built-in 2FA solver, but `launchPersistentContext(userDataDir)` preserves auth state so 2FA is only needed once. Can pause for manual 2FA input in headed mode. |
| Session persistence | **Excellent** | Two approaches: (1) `launchPersistentContext` with `userDataDir` saves all cookies/localStorage/cache to disk. (2) `storageState()` exports/imports auth cookies as JSON. Both avoid re-login. |
| File downloads | **Excellent** | Native `download` event handling. Can set download path, wait for completion, and access saved files. |
| Headless/headed | **Both** | Seamless switching. Headed mode useful for initial 2FA setup. |
| Local/hosted | **Local** | Runs locally. Can be paired with Browserbase/Steel for cloud hosting. |
| LLM integration | **Indirect** | No native LLM integration — it's a browser library, not an AI framework. Used as the engine under browser-use, Stagehand, Skyvern. |
| Maturity | **Excellent** | Microsoft-backed, massive community, frequent releases, excellent docs. The de facto standard. |

**Verdict:** Essential foundation layer. Use it directly for deterministic steps (login flow, navigation, downloads) and through browser-use for AI-driven steps.

---

### 2. browser-use (Open Source)

**What it is:** Python library that gives LLMs (Claude, GPT, Gemini, local models) direct browser control via Playwright. The agent sees the page, reasons about it, and takes actions in natural language.

| Criterion | Rating | Notes |
|-----------|--------|-------|
| 2FA handling | **Moderate** | Can reuse real browser profiles. Cloud version offers better fingerprinting. For email-based 2FA: agent can be instructed to check email, but requires either (a) manual intervention, (b) an email API integration, or (c) persistent sessions to avoid repeated 2FA. |
| Session persistence | **Good** | Supports Playwright's `userDataDir` for persistent context. Cloud version advertises persistent filesystem/memory. Open-source requires manual setup. |
| File downloads | **Moderate** | Active development. `download_from_remote_browser` flag exists. For local Playwright, standard download handling works. Remote browser downloads require workarounds. |
| Headless/headed | **Both** | Inherits from Playwright. |
| Local/hosted | **Both** | Open-source runs locally. browser-use Cloud available for hosted. |
| LLM integration | **Excellent** | First-class support for Claude (Anthropic), GPT-4, Gemini, Ollama local models. `ChatBrowserUse()` is their optimized model. Model-agnostic architecture. |
| Maturity | **Excellent** | 87.4k GitHub stars, very active development, large community, good docs. Scoring 89% on WebVoyager benchmark. |

**Verdict:** Best open-source AI browser agent framework. Ideal for the MyChart use case when paired with Playwright persistent context for session management.

---

### 3. Skyvern (Open Source + Hosted)

**What it is:** AI browser automation using LLMs + computer vision. Vision-based approach means it works on unfamiliar sites without pre-coded selectors. Extends Playwright.

| Criterion | Rating | Notes |
|-----------|--------|-------|
| 2FA handling | **Excellent** | Built-in `page.agent.login()` with credential vault integration (Bitwarden, 1Password, native). Handles MFA prompts, CAPTCHAs. Healthcare customers already use it for portal logins. |
| Session persistence | **Good** | Handles sessions via their cloud platform. Self-hosted requires configuration. |
| File downloads | **Excellent** | Native `page.agent.download_files(prompt)` API — natural language file download. |
| Headless/headed | **Both** | Playwright-based, supports both. |
| Local/hosted | **Both** | `pip install skyvern && skyvern quickstart` for local. Docker Compose available. Cloud hosted option. |
| LLM integration | **Good** | Uses vision LLMs for page understanding. Less model-agnostic than browser-use; focused on their optimized pipeline. |
| Maturity | **Good** | 21.1k GitHub stars, SOC2 Type II certified, **HIPAA compliant**. Active healthcare customer base (Epic, Cerner, athenahealth). |

**Verdict:** The strongest contender for healthcare specifically. HIPAA compliance, credential vault integration, and proven EHR/EMR automation make it uniquely suited. The `download_files()` API is exactly what we need. Main trade-off: smaller community than browser-use, more opinionated architecture.

---

### 4. Stagehand (Browserbase)

**What it is:** Browserbase's open-source SDK providing four primitives (`act`, `extract`, `observe`, `agent`) for natural-language browser automation. Tightly coupled with Browserbase cloud.

| Criterion | Rating | Notes |
|-----------|--------|-------|
| 2FA handling | **Moderate** | Relies on Browserbase's session management. No built-in credential vault. |
| Session persistence | **Good** | Via Browserbase session persistence (cloud). |
| File downloads | **Good** | Browserbase stores downloads in cloud storage with timestamps. |
| Headless/headed | **Headless** | Cloud-first, headless by design. |
| Local/hosted | **Hosted primarily** | Can run locally but designed for Browserbase cloud. |
| LLM integration | **Excellent** | Supports OpenAI, Anthropic, Gemini via Vercel AI SDK. Model Gateway for single-key access. |
| Maturity | **Good** | 500k+ weekly downloads (v2). v3 launched with 44% speed improvement. TypeScript-first (Python SDK available). |

**Verdict:** Strong cloud-native option with excellent AI primitives. The Browserbase dependency is now a *feature* (cloud-first requirement), but the lack of HIPAA compliance from Browserbase blocks this for health data. TypeScript-first is also a friction point if the rest of the stack is Python.

---

### 5. Browserbase (Hosted Infrastructure)

**What it is:** "AWS for headless browsers." Cloud-hosted browser instances with stealth features, CAPTCHA solving, proxies, and session recording. $40M Series B at $300M valuation (June 2025).

| Criterion | Rating | Notes |
|-----------|--------|-------|
| 2FA handling | **Good** | Authentication management guides available. Session persistence helps avoid re-auth. |
| Session persistence | **Excellent** | Native session persistence — maintain cookies across sessions. |
| File downloads | **Good** | Cloud storage for downloads, accessible via API. |
| Headless/headed | **Headless** | Cloud-only, headless. |
| Local/hosted | **Hosted only** | No self-hosting option. |
| LLM integration | **Good** | Framework-agnostic. Works with Playwright/Puppeteer. Stagehand is their AI layer. |
| Maturity | **Excellent** | Well-funded, trusted by Vercel/Perplexity/Clay. Strong docs. |

**Cloud assessment:** Browserbase is the most mature cloud browser infrastructure. The "Contexts" feature provides excellent session persistence — cookies, localStorage, IndexedDB all persist across sessions with unique encryption at rest. However, **no published HIPAA compliance or BAA** makes it unsuitable for health data without further diligence. If Browserbase announces healthcare compliance, it becomes a top-tier option paired with Stagehand.

---

### 6. Steel (Open Source + Hosted)

**What it is:** Open-source browser API for AI agents. Self-hostable or cloud-hosted. Recently integrated with Hermes (Nous Research) agent framework.

| Criterion | Rating | Notes |
|-----------|--------|-------|
| 2FA handling | **Moderate** | Cookie injection/persistence to maintain auth. No built-in 2FA solver. |
| Session persistence | **Good** | Save and inject cookies and localStorage. |
| File downloads | **Good** | Standard Playwright/Puppeteer download support. |
| Headless/headed | **Both** | Via Chrome DevTools Protocol. |
| Local/hosted | **Both** | Self-host via Docker or use Steel Cloud. |
| LLM integration | **Moderate** | Browser infrastructure only — pair with your own AI layer. |
| Maturity | **Moderate** | Smaller community than alternatives. Growing with Hermes integration. |

**Verdict:** Good infrastructure option if self-hosting is required and you want more control than Browserbase. Less relevant than browser-use or Skyvern as a complete solution.

---

### 7. Anchor Browser (Hosted)

**What it is:** Enterprise-focused agentic browser infrastructure. Up to 50,000 concurrent browsers. Cloud or on-premises.

| Criterion | Rating | Notes |
|-----------|--------|-------|
| 2FA handling | **Good** | Supports MFA and SSO integration. |
| Session persistence | **Good** | Authenticated environments maintained. |
| File downloads | **Good** | Standard browser download support. |
| Headless/headed | **Both** | Cloud and on-premises options. |
| Local/hosted | **Hosted / On-premises** | Enterprise deployment, not developer self-serve. |
| LLM integration | **Moderate** | AI-driven deterministic task planning. Less model-agnostic. |
| Maturity | **Moderate** | Enterprise-focused, less open-source community. |

**Verdict:** Enterprise play. Overkill for a single-user MyChart agent. Worth considering if this grows to serve many patients at scale.

---

### 8. Puppeteer (Google)

| Criterion | Rating | Notes |
|-----------|--------|-------|
| 2FA handling | **Moderate** | Cookie management available, no built-in 2FA. |
| Session persistence | **Good** | `userDataDir` support. |
| File downloads | **Good** | Supported via CDP. |
| Headless/headed | **Both** | Chrome/Chromium only. |
| Local/hosted | **Local** | Node.js only. |
| LLM integration | **None** | Raw browser library. |
| Maturity | **Excellent** | Google-maintained, but Playwright has surpassed it for new projects. |

**Verdict:** No advantage over Playwright for this use case. Node.js compatibility is fine for our TypeScript stack, but Playwright is still the preferred foundation for new projects — broader browser support, auto-waiting, and it's the engine under both Stagehand and Skyvern.

---

### 9. Selenium

| Criterion | Rating | Notes |
|-----------|--------|-------|
| 2FA handling | **Moderate** | Manual cookie management. |
| Session persistence | **Moderate** | Possible but more manual than Playwright. |
| File downloads | **Moderate** | Browser-specific configuration required. |
| Headless/headed | **Both** | Broadest browser support. |
| Local/hosted | **Local** | Can pair with Selenium Grid for remote. |
| LLM integration | **None** | Raw browser library. |
| Maturity | **Excellent** | Legacy standard, huge community, but slower and more complex than modern alternatives. |

**Verdict:** No reason to choose over Playwright for a greenfield project.

---

## Additional Notable Tools

### Claude Computer Use / Claude in Chrome
Anthropic's native browser control. Claude can control a real Chrome browser, navigate sites, fill forms. Relevant but designed for general computer use, not programmable agent workflows. Not suitable as a foundation — better as a fallback capability.

### Vercel agent-browser
CLI for AI agents to control browsers. Early stage, worth watching but not production-ready for healthcare.

---

## Comparison Matrix (Cloud-First, MVP Constraints)

| Tool | Manual 2FA Pause | Built-in Credentials | Downloads | Cloud Deploy | LLM Integration | Maturity | HIPAA (future) |
|------|-----------------|---------------------|-----------|-------------|-----------------|----------|----------------|
| **Browserbase + Stagehand** | Good (session debug URL) | **Contexts** (built-in) | Good (cloud API) | **Hosted SaaS** | **Excellent** (Claude via Vercel AI SDK) | **Excellent** | Upgrade to Skyvern |
| **Skyvern** | Good | 1Password, Bitwarden | **Excellent** (`download_files()`) | Self-host (Docker) | Good | Good | **Yes/Yes** |
| **browser-use Cloud** | Moderate | 1Password (`opVaultId`) | Good (presigned URLs) | Hosted SaaS | **Excellent** (native Claude) | **Excellent** | No path |
| **Steel** | Moderate | None | Good | Self-host (Docker) | Moderate | Moderate | No |
| **Anchor** | Good | SSO | Good | Hosted/On-prem | Moderate | Moderate | Unknown |
| **Playwright** | Good (headed mode) | None | Excellent | Needs infra | Indirect | Excellent | N/A |

---

## Recommendation (MVP — Cloud-First, HIPAA Deferred)

### Primary Stack: Browserbase + Stagehand

```
Claude (Anthropic API)
    |
Stagehand (AI orchestration — act/extract/observe/agent primitives)
    |
Browserbase (cloud-hosted Chromium — managed infrastructure)
    |
Ephemeral credentials (user provides at runtime, never persisted)
    |
Browserbase Downloads API → zip bundling → user download
```

**Why this stack for MVP:**

1. **Ephemeral credentials — simple and secure.** User provides MyChart username/password at runtime each session. Stagehand fills the login form via `act()`. Credentials are never stored in Contexts, vaults, or anywhere else. This eliminates credential storage as an attack surface entirely.

2. **Manual 2FA with live browser view.** Browserbase provides session debug/connect URLs that surface a live view of the cloud browser. When the agent detects a 2FA prompt, it pauses and presents the URL to the user. User enters the 2FA code manually, agent continues. Stagehand's `observe` primitive can detect the 2FA input field and trigger the pause. No email API integration needed for MVP.

3. **Zero infrastructure management.** Browserbase is fully managed SaaS — no Docker, no VMs, no VPC configuration. Create an API key and start building. This is the fastest path to a working MVP.

4. **Excellent Claude/LLM integration.** Stagehand supports Claude via the Vercel AI SDK. The `act("click the lab results link")`, `extract("get all test names and values")`, and `agent("navigate to my recent visits")` primitives map directly to MyChart navigation tasks.

5. **File downloads via API.** Browserbase stores downloaded files in cloud storage with timestamps, accessible via their Downloads API. The orchestration layer collects all downloaded files and bundles them into a zip for the user.

6. **Session persistence available when needed.** Not required for MVP, but Browserbase Contexts support cookie/session persistence for the future — cookies persist indefinitely until deleted or expired. When session persistence becomes a priority, it's a configuration change, not a migration. (Note: Contexts would be used for cookies/session state only, not credential storage.)

7. **Most mature cloud browser infrastructure.** $40M Series B, trusted by Vercel/Perplexity/Clay, excellent docs, CAPTCHA solving, stealth mode, session recording for debugging.

### MVP 2FA Flow (Manual Entry)

```
Agent starts → receives credentials from user at runtime
    → navigates to MyChart login → fills credentials via Stagehand act()
    → MyChart sends email 2FA code
    → Agent detects 2FA prompt (Stagehand observe)
    → Agent PAUSES — surfaces Browserbase session debug URL to user
    → User opens debug URL in their browser, sees the live MyChart page
    → User enters 2FA code manually
    → Agent resumes — navigates to health records, downloads files
    → Agent bundles files into zip → delivers to user
```

### MVP File Output Flow (Zip)

```
Agent navigates to each record type (labs, visits, medications, etc.)
    → triggers downloads via Stagehand act("download PDF")
    → files stored in Browserbase cloud storage
    → orchestration layer fetches files via Downloads API
    → bundles into a single .zip file
    → delivers zip to user (presigned URL or direct download)
```

### Future Upgrade Path: Skyvern (When HIPAA Required)

When the project needs HIPAA compliance, BAAs, or multi-patient support:

| MVP (Browserbase + Stagehand) | Future (Skyvern self-hosted) |
|-------------------------------|------------------------------|
| Managed SaaS | Self-hosted Docker on HIPAA-eligible AWS/GCP |
| Browserbase Contexts for credentials | 1Password / Bitwarden vault |
| Manual 2FA via debug URL | Automated 2FA via Gmail API + TOTP |
| No session persistence | Persistent sessions to minimize re-auth |
| No HIPAA/BAA | HIPAA + SOC2 Type II + BAA |
| Browserbase Downloads API | `download_files()` + encrypted S3/GCS |
| Stagehand primitives | Skyvern's `page.act()` / `page.extract()` (similar API shape) |

The migration is moderate effort — Skyvern and Stagehand both extend Playwright with similar AI-driven primitives. The agent logic (navigate MyChart, find records, download files) ports across. The main work is infrastructure setup and compliance configuration.

### What to Avoid

- **Raw Playwright/Puppeteer/Selenium in cloud** — No AI orchestration layer. Massive engineering effort to build what Stagehand/Skyvern give you out of the box.
- **browser-use Cloud** — Viable alternative but 15-minute session limit is a risk for complex MyChart workflows. Credential management requires 1Password integration rather than built-in. No clear HIPAA upgrade path.
- **Anchor Browser** — Enterprise pricing and complexity. No self-serve developer experience.
- **Self-hosting anything for MVP** — User constraint is cloud-first with minimal infrastructure overhead. Self-hosting Skyvern or Steel adds Docker/VM management that isn't justified until HIPAA is required.

---

## Cloud-Specific Considerations

### Credential Storage for MVP

| Approach | Recommendation | Notes |
|----------|---------------|-------|
| **Ephemeral (runtime input)** | **MVP choice** | User provides credentials each run. Passed to Stagehand `act()` fill calls. Never persisted anywhere. |
| **1Password / Bitwarden** | Future (Skyvern) | For HIPAA phase when credentials need vault-grade management. |
| **Browserbase Contexts** | Future (cookies only) | For session/cookie persistence when that phase arrives. Not for credential storage. |

### 2FA Strategy (Phased)

| Phase | Approach | Notes |
|-------|----------|-------|
| **MVP** | **Manual entry** via Browserbase debug URL | Agent pauses, user enters code in live browser view. Simple, reliable. |
| **Phase 2** | **Gmail API integration** | Automated email 2FA code retrieval. Agent reads code and enters it. Requires OAuth consent. |
| **Phase 3** | **TOTP** (if MyChart supports it) | Store TOTP secret in credential vault. Generate codes programmatically. Most reliable. |

### File Output (Zip)

| Step | Tool | Notes |
|------|------|-------|
| Download individual files | Stagehand `act()` + Browserbase Downloads API | Each record type downloaded separately |
| Retrieve from cloud storage | Browserbase Downloads API | Files accessible via API after session |
| Bundle into zip | Application code (Node `archiver` or similar) | Runs in the orchestration layer, not the browser |
| Deliver to user | Presigned URL or direct response | Time-limited download link |

### Health Data Privacy

| Consideration | MVP Posture | Future Posture |
|--------------|-------------|----------------|
| HIPAA compliance | Risk accepted | Skyvern self-hosted + BAA |
| Data transit | Through Browserbase (3rd party) | Within our infrastructure |
| Encryption at rest | Browserbase encrypts Contexts | AES-256 on S3/GCS |
| Encryption in transit | TLS (Browserbase default) | TLS 1.3 enforced |
| Data retention | Browserbase manages | We control retention + auto-delete |
| Audit trails | Browserbase session recordings | Skyvern immutable audit trails |

---

## Implementation Notes for the MVP Cloud MyChart Agent

1. **Setup:** Create a Browserbase account and API key. Install Stagehand SDK.

2. **Credentials (ephemeral):** User provides MyChart username/password at the start of each run (e.g., via a prompt, API request, or secure form). Credentials are held in memory only for the duration of the session and never written to Browserbase Contexts, disk, or any persistent store.

3. **Login flow:** Create a Browserbase session (no Context needed for MVP). Stagehand navigates to MyChart login, fills username/password via `act()` using the runtime-provided credentials. When the 2FA prompt appears, `observe` detects it and the agent pauses, returning the session debug URL to the user.

4. **Manual 2FA:** User opens the debug URL in their browser, sees the live MyChart 2FA page, enters the code from their email. Agent detects successful auth and resumes.

5. **Navigation & extraction:** Stagehand's `agent` primitive navigates MyChart — finds lab results, visit summaries, medications, etc. `extract` pulls structured data. `act` triggers file downloads.

6. **File collection:** Browserbase stores downloaded files in cloud storage. After the session completes, the orchestration layer retrieves all files via the Downloads API and bundles them into a single zip.

7. **Delivery:** The zip file is made available to the user via a presigned download URL (time-limited) or served directly through the application's API.

8. **Error handling:** Stagehand's AI-driven navigation handles MyChart UI changes. Session recordings (built into Browserbase) provide debugging visibility when things go wrong.
