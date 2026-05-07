# FetchWell — PRD + Technical Design

## 1. Product Overview

FetchWell is a macOS desktop app that extracts medical records from patient portals as PDFs. It runs an AI-powered browser agent locally on the user's machine — no data leaves their device except LLM API calls to Anthropic (using the user's own API key). The extracted PDFs are saved to a local folder, ready to upload to Claude.ai or use however the user wants.

The app wraps the existing extraction pipeline in an Electron shell. The core automation is already built and working against multiple portals (UCSF MyChart, Stanford MyChart, OneMedical). This project adds a GUI, credential management, and a user-friendly 2FA flow.

### Target user

Someone who wants their health records as PDFs but is not comfortable with git, Node.js, or terminal commands. They can follow setup instructions, paste an API key, and enter their portal credentials.

### Core principle: transparency

When there is a tradeoff between simplicity and transparency, choose transparency. The user should understand what the app is doing, what data the AI agent sees, and what is stored where.

## 2. User Experience

### 2.1 First launch

1. **Welcome / overview screen.** Explains:
   - What the app does (AI agent navigates your patient portal, downloads your health records as PDFs)
   - How it works (Playwright browser automation + Anthropic Claude for navigation intelligence)
   - Where data is stored (PDFs saved to a local folder you choose; credentials encrypted in your OS keychain)
   - Privacy disclosure: the LLM sees page content during navigation (DOM snapshots, not screenshots) but Anthropic does not train on API inputs and deletes them after processing. We (the app developer) never see or store any health data.
   - Why the user provides their own API key: we don't want to be in the path of their data at all. Their key means their API calls go directly from their machine to Anthropic.

2. **API key setup.** Enter Anthropic API key (one-time, shared across all portals). Link to Anthropic's API key page for users who don't have one yet. Validate the key by making a test API call before proceeding.

3. **Download folder.** Choose a root download folder (default: `~/Documents/HealthRecords`). The app creates per-portal subdirectories underneath this (e.g., `~/Documents/HealthRecords/ucsf/`, same structure as current `output/<provider-id>/`).

4. **Add portal.** See section 2.2.

### 2.2 Adding a portal

The "Add Portal" flow collects:

1. **Portal URL.** The login page URL for the patient portal (e.g., `https://mychartucsf.ucsfmedicalcenter.org`).
2. **Portal name.** User-friendly label (e.g., "UCSF Medical Center"). Auto-suggested from the URL domain if possible.
3. **Credentials.** Username/email and password. The app asks: "Would you like us to save your credentials securely, or enter them each time?" If saved, encrypted via Electron `safeStorage` (OS keychain). If not saved, the app prompts on each run.
4. **2FA setup.** Ask the user:
   - "Does this portal require a verification code (2FA) when you log in?" (Yes / No / I'm not sure)
   - If yes: "Is the code sent via email, text message, or an authenticator app?"
   - Explain: "When a verification code is needed, the app will pause and ask you to enter it. You'll need to be nearby during extraction."
   - If "I'm not sure": "No problem. If the portal asks for a code, the app will pause and prompt you."

After adding, the portal appears in the portal list with status "Not yet mapped" and the Extract button disabled.

### 2.3 Portal list (main screen)

The main screen shows a list of configured portals. Each portal card shows:

- Portal name and URL
- Status: "Not yet discovered" / "Ready" / "Extracting..." / "Last extracted: [date]"
- **Map** button — always available (can re-run to update the nav-map)
- **Extract** button — disabled with tooltip "Run Mapping first" until mapping has completed at least once. After mapping, enabled.
- **Settings** gear icon — edit credentials, URL, 2FA settings, or remove the portal

### 2.4 Discovery flow

When the user clicks "Map" on a portal:

1. App shows a progress panel with a log stream (scrolling text, similar to a terminal).
2. The log shows each step: "Launching browser...", "Navigating to portal...", "Logging in...", "Exploring navigation...", "Found: Lab Results", "Found: Visits", etc.
3. If 2FA is triggered, a modal appears over the progress panel: "Enter the verification code sent to your [email/phone]" with a text input and Submit button. The automation pauses until the user submits.
4. On completion: "Mapping complete. Found 4/4 sections: Labs, Visits, Medications, Messages." The portal status updates to "Ready" and the Extract button becomes enabled.
5. On failure: show the error in the log, display a summary: "Mapping failed. [Specific explanation of what went wrong and whether retrying is likely to help, or whether the user needs to take action — e.g., check credentials, check portal URL, try again later.]"

### 2.5 Extraction flow

When the user clicks "Extract" on a portal:

1. Same progress panel with log stream.
2. Progress indicators per section: "Labs (3/12)", "Visits (1/8)", etc.
3. 2FA modal if triggered (same as discovery).
4. On completion: summary of what was extracted, with an "Open in Finder" button pointing to the portal's output directory.
5. On failure: same error reporting as discovery — be specific about what went wrong, whether retrying makes sense, and what the user can do.

### 2.6 Settings

Global settings accessible from the app menu or a gear icon:

- **API key.** View (masked) / change Anthropic API key. We need a section in the UI to walk novice users through the workflow of getting an API. We should give them a rough estimate of cost per mapping and extraction run. Our software is free, but you gotta pay Anthropic to have claude run the browser.
- **Download folder.** Change root download path.
- **Browser visibility.** Toggle: "Show browser window during automation" (default: off). When turned on, show a warning: "The browser window will be visible during automation. Do not click, type, or interact with the browser window while the agent is operating — this will interfere with the extraction process."
- **Incremental extraction.** Toggle: "Only fetch records newer than last extraction" (default: on after first successful extraction).

### 2.7 Error handling philosophy

The app should try to be smart about errors:

- **Credential errors** (login failed): "Login failed. Please check your username and password in portal settings."
- **2FA timeout** (user didn't enter code): "The verification code was not entered within 5 minutes. Please try again."
- **Portal structure changed** (nav-map stale): "The portal's layout may have changed since discovery. Try running Discover again."
- **Network errors**: "Could not reach [portal URL]. Check your internet connection and try again."
- **Unknown errors**: "Something went wrong during extraction. The error details are shown in the log above. [Copy log] [Try again]"

The app should never just say "An error occurred." Always be specific.

## 3. Technical Design

### 3.1 Architecture overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Electron App                                │
│                                                                 │
│  ┌───────────────┐          IPC           ┌──────────────────┐  │
│  │   Renderer    │◄─────────────────────►│   Main Process    │  │
│  │   (React)     │                       │                   │  │
│  │               │  extraction:progress  │  ┌─────────────┐  │  │
│  │ - Portal list │  extraction:log       │  │ Extraction  │  │  │
│  │ - Progress    │  extraction:complete  │  │ pipeline    │  │  │
│  │ - 2FA modal   │  extraction:error     │  │ (existing)  │  │  │
│  │ - Settings    │  2fa:request/submit   │  └──────┬──────┘  │  │
│  │               │  discovery:progress   │         │         │  │
│  │               │  discovery:complete   │  ┌──────▼──────┐  │  │
│  └───────────────┘  discovery:error      │  │ Playwright  │  │  │
│                                          │  │ + Stagehand │  │  │
│                                          │  │ (bundled    │  │  │
│                                          │  │  Chromium)  │  │  │
│                                          │  └─────────────┘  │  │
│                                          └──────────────────┘  │
│                                                                 │
│  Credentials: Electron safeStorage → macOS Keychain             │
│  Config: app.getPath('userData')/config.json                    │
│  Nav-maps: <downloadFolder>/<portalId>/nav-map.json             │
│  PDFs: <downloadFolder>/<portalId>/*.pdf                        │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Process model

**Main process** (Node.js): runs the extraction/discovery pipeline, manages credentials, launches Playwright. This is where all the existing `src/` code runs.

**Renderer process** (React): the UI. Communicates with main via Electron IPC. Never touches credentials directly — requests them from main process, which decrypts from safeStorage.

**Preload script**: bridges renderer and main via `contextBridge.exposeInMainWorld()`. Exposes a typed API surface (see section 3.5).

### 3.3 What already exists (and how it maps)

The current codebase handles the hard parts. Here's what maps to the Electron app and what changes:

| Existing code | Role | Changes needed for Electron |
|---|---|---|
| `src/extract/index.ts` | Extraction pipeline entry point. Parses CLI args, selects providers, runs `extractProvider()` per provider. | Replace CLI arg parsing and `console.log` with IPC events. Replace `process.exit` with error reporting. Remove `dotenv` — config comes from Electron. |
| `src/discover/cli.ts` | Discovery CLI entry point. Same pattern as extract. | Same changes as extract entry point. |
| `src/discover/index.ts` | Discovery engine. `discoverPortal()` explores nav structure, builds nav-map. | No changes. Called from main process with existing API. |
| `src/config.ts` | Zod schema for `ProviderConfig`, reads `providers.json` from disk. | Replace `loadProviders()` file reader with a function that reads from Electron's config store. Schema stays the same. |
| `src/auth/shared.ts` | Auth utilities: `ensureLoggedIn()`, `waitForFileBasedCode()`, `enterCodeInBrowser()`, `fetchGmailVerificationCode()`, `prompt()`. | Replace `waitForFileBasedCode()` with IPC-based `waitForOTP()`. Replace `prompt()` (readline) with IPC-based prompt. `fetchGmailVerificationCode()` becomes optional (can keep as convenience). Remove `GMAIL_USER`/`GMAIL_APP_PASSWORD` env var reads — configure in settings if desired. |
| `src/auth/index.ts` | Composable auth module factory. `getAuthModule()` composes login-form + 2FA strategies from `AuthSettings`. | No changes to composition logic. |
| `src/auth/strategies/login-form.ts` | Login form strategies: `twoStep` and `singlePage`. Both read credentials from env vars or `prompt()`. | Read credentials from function parameters only (passed from Electron config). Remove `process.env` fallbacks and `prompt()` fallback. |
| `src/auth/strategies/two-factor.ts` | 2FA strategies: `none`, `email`, `manual`. Email strategy uses Gmail IMAP, manual uses file-watching. | Add `ui` strategy: sends IPC `2fa:request`, awaits `2fa:submit` response. Make this the default. Keep `email` as opt-in if Gmail credentials are configured. Remove `manual` (file-watching). |
| `src/browser/index.ts` | Factory: `createBrowserProvider()` returns `StagehandLocalProvider` or `PlaywrightLocalProvider` based on env var. | Pass provider type and headless flag as parameters instead of reading env vars. |
| `src/browser/providers/stagehand-local.ts` | Stagehand + Playwright provider. Reads `ANTHROPIC_API_KEY` from env, creates `AISdkClient`. | Accept API key as constructor parameter instead of reading from env. |
| `src/browser/interface.ts` | `BrowserProvider` interface, `SerializedSession`, `ObserveResult`. | No changes. |
| `src/session.ts` | Cookie persistence: `loadSavedSession()`, `saveSession()`, `clearSession()`. Reads/writes `output/<provider>/session.json`. | Update paths to use Electron's output directory instead of hardcoded `output/`. |
| `src/extract/helpers.ts` | PDF merging, nav-map loading, incremental timestamp tracking, `navigateToSection()`, `buildIndex()`. | Update `OUTPUT_BASE` to use Electron's configured download folder. Rest stays the same. |
| `src/extract/labs.ts`, `visits.ts`, `medications.ts`, `messages.ts` | Per-section extractors. Each takes a `BrowserProvider`, portal URL, output dir, etc. | No changes to extraction logic. They already accept `outputDir` as a parameter. |
| `src/discover/nav-map.ts` | `loadNavMap()`, `saveNavMap()`. Reads/writes `output/<provider>/nav-map.json`. | Update paths to use Electron's configured download folder. |

### 3.4 New code to write

#### 3.4.1 Electron shell

- `electron/main.ts` — Electron main process entry point. Creates `BrowserWindow`, registers IPC handlers.
- `electron/preload.ts` — Preload script exposing typed API to renderer.
- `electron/config.ts` — App config manager. Reads/writes portal list, API key, settings to `app.getPath('userData')/config.json`. Uses `safeStorage` for credential encryption.

#### 3.4.2 Pipeline adapters

The existing pipeline code uses `console.log`, `process.env`, `process.exit`, and file-based 2FA relay. Rather than rewriting the pipeline, we build thin adapter layers:

- `electron/pipeline-bridge.ts` — Wraps `extractProvider()` and `discoverPortal()` with:
  - A `Logger` that sends `console.log` output as IPC events to the renderer
  - A `waitForOTP()` implementation that sends `2fa:request` via IPC and returns a Promise resolved by `2fa:submit`
  - Config injection: passes API key, credentials, output paths as parameters instead of env vars
  - Error catching: catches pipeline errors and sends structured error info via IPC instead of `process.exit`

- `electron/env-bridge.ts` — Sets `process.env` values from Electron config before invoking pipeline code. This is the pragmatic path for the many places the existing code reads env vars (`ANTHROPIC_API_KEY`, `BROWSER_PROVIDER`, `HEADLESS`, etc.). A full refactor to pass everything as parameters is cleaner but larger scope. For MVP, set env vars programmatically before each pipeline run.

#### 3.4.3 2FA strategy: `ui`

Add a new 2FA strategy to `src/auth/strategies/two-factor.ts`:

```typescript
/**
 * UI-based 2FA: sends a request to the Electron renderer and waits
 * for the user to enter the code in the app's 2FA modal.
 *
 * The `otpCallback` is injected by the pipeline bridge before
 * the auth module is created.
 */
const ui: TwoFactorHandler = async (browser, providerId) => {
  await new Promise((r) => setTimeout(r, 3000));
  const twoFaObservations = await detect2FA(browser);

  if (twoFaObservations.length > 0) {
    console.log("2FA/MFA detected!");
    // otpCallback is set by the Electron pipeline bridge
    const code = await otpCallback!();
    if (code) {
      await enterCodeInBrowser(browser, code);
    }
    await waitForPostLoginNavigation(browser);
  } else {
    await verifyLoginSuccess(browser);
  }
};
```

This keeps the 2FA strategy pluggable — CLI mode still uses `email` or `manual`, Electron mode uses `ui`.

#### 3.4.4 Renderer (React)

- `src/renderer/App.tsx` — Top-level: routes between Welcome, PortalList, Settings.
- `src/renderer/pages/Welcome.tsx` — First-launch overview + API key setup + download folder picker.
- `src/renderer/pages/PortalList.tsx` — Main screen: list of portals with Discover/Extract buttons.
- `src/renderer/pages/AddPortal.tsx` — Add/edit portal form.
- `src/renderer/pages/Settings.tsx` — Global settings (API key, download folder, browser visibility, incremental mode).
- `src/renderer/components/ProgressPanel.tsx` — Log stream + progress indicators. Used by both Discover and Extract flows.
- `src/renderer/components/TwoFactorModal.tsx` — 2FA code entry modal.
- `src/renderer/components/ErrorSummary.tsx` — Structured error display with actionable guidance.

### 3.5 IPC API

The preload script exposes this API to the renderer:

```typescript
interface ElectronAPI {
  // Portal management
  getPortals(): Promise<PortalConfig[]>;
  addPortal(portal: PortalInput): Promise<PortalConfig>;
  updatePortal(id: string, updates: Partial<PortalInput>): Promise<PortalConfig>;
  removePortal(id: string): Promise<void>;

  // Discovery
  startDiscovery(portalId: string): Promise<void>;
  onDiscoveryProgress(callback: (data: ProgressEvent) => void): void;
  onDiscoveryComplete(callback: (data: DiscoveryResult) => void): void;
  onDiscoveryError(callback: (data: ErrorEvent) => void): void;

  // Extraction
  startExtraction(portalId: string, options?: { incremental?: boolean }): Promise<void>;
  onExtractionProgress(callback: (data: ProgressEvent) => void): void;
  onExtractionComplete(callback: (data: ExtractionResult) => void): void;
  onExtractionError(callback: (data: ErrorEvent) => void): void;

  // 2FA
  on2FARequest(callback: (data: { message: string }) => void): void;
  submit2FA(code: string): void;

  // Settings
  getSettings(): Promise<AppSettings>;
  updateSettings(updates: Partial<AppSettings>): Promise<void>;
  validateApiKey(key: string): Promise<boolean>;

  // File system
  chooseFolder(): Promise<string | null>;  // native folder picker dialog
  openInFinder(path: string): void;        // shell.openPath()
}

interface ProgressEvent {
  phase?: string;       // "labs", "visits", etc.
  current?: number;     // current item index
  total?: number;       // total items in phase
  message: string;      // log line
}

interface ErrorEvent {
  message: string;              // human-readable error summary
  details: string;              // full error/stack trace
  recoverable: boolean;         // whether retrying is likely to help
  suggestion: string;           // actionable guidance for the user
}

interface PortalConfig {
  id: string;                   // slug derived from name
  name: string;
  url: string;
  hasCredentials: boolean;      // true if creds are saved (don't expose actual creds to renderer)
  authStrategy: {
    loginForm: "two-step" | "single-page";
    twoFactor: "none" | "ui";   // Electron always uses "ui" for 2FA
  };
  discoveredAt: string | null;  // ISO timestamp of last discovery, null if never
  lastExtractedAt: string | null;
}

interface AppSettings {
  downloadFolder: string;
  browserVisible: boolean;
  incrementalDefault: boolean;
  apiKeyConfigured: boolean;    // don't expose actual key to renderer
}
```

### 3.6 Credential storage

All sensitive data is encrypted via Electron's `safeStorage` API, which delegates to macOS Keychain.

**What is encrypted:**
- Anthropic API key
- Per-portal username and password

**Storage format:** A single JSON file at `app.getPath('userData')/credentials.enc.json` containing base64-encoded encrypted buffers:

```json
{
  "apiKey": "<base64 encrypted>",
  "portals": {
    "ucsf": {
      "username": "<base64 encrypted>",
      "password": "<base64 encrypted>"
    }
  }
}
```

**Access pattern:** Only the main process can call `safeStorage.encryptString()` / `safeStorage.decryptString()`. The renderer never sees raw credentials — it only knows `hasCredentials: boolean` and `apiKeyConfigured: boolean`.

When the pipeline needs credentials (at login time), the main process decrypts them and passes them to the auth module as function parameters.

### 3.7 Config storage

Non-sensitive config lives in `app.getPath('userData')/config.json`:

```json
{
  "downloadFolder": "/Users/chad/Documents/HealthRecords",
  "browserVisible": false,
  "incrementalDefault": true,
  "portals": [
    {
      "id": "ucsf",
      "name": "UCSF Medical Center",
      "url": "https://mychartucsf.ucsfmedicalcenter.org",
      "auth": {
        "loginForm": "two-step",
        "twoFactor": "ui"
      },
      "discoveredAt": "2026-05-07T10:30:00Z",
      "lastExtractedAt": "2026-05-07T11:00:00Z"
    }
  ]
}
```

### 3.8 Auth strategy auto-detection

The user shouldn't need to know whether their portal uses a "two-step" or "single-page" login form. On first discovery, the app attempts to detect this:

1. Navigate to the portal URL.
2. Observe the login page: "Is there a single form with both email/username and password fields visible, or is there only a username/email field with a Next button?"
3. If both fields visible → `single-page`. If only username visible → `two-step`.
4. Store the detected strategy in the portal config.

If detection fails, default to `two-step` (the more common pattern for Epic MyChart portals) and let the user override in portal settings.

### 3.9 Output directory structure

Same as current `output/<provider-id>/` structure, but rooted at the user's chosen download folder:

```
~/Documents/HealthRecords/
  ucsf/
    nav-map.json          # discovery output
    session.json          # cookie persistence (12h TTL)
    last-extracted.json   # incremental timestamps
    labs-ucsf.pdf         # merged PDFs
    visits-ucsf.pdf
    medications-ucsf.pdf
    messages-ucsf.pdf
    index.html            # browsable index
    labs/                  # individual PDFs per item
      001_cbc-panel-may-01-2026-ucsf.pdf
      ...
    visits/
    discover/             # discovery screenshots
  stanford/
    ...
```

### 3.10 Packaging and distribution

| Item | Detail |
|---|---|
| Framework | Electron (bundles Chromium + Node.js) |
| Bundled browser | Playwright's Chromium (via `playwright install chromium`) |
| Build tool | electron-builder |
| Platform | macOS only (MVP) |
| Signing | Apple Developer Program ($99/yr), Developer ID Application certificate |
| Notarization | Required for Gatekeeper; electron-builder handles via `notarize` plugin |
| Package format | DMG from project website |
| Auto-update | electron-updater via GitHub Releases |
| App size | ~350MB DMG (Electron ~120MB + Playwright Chromium ~200MB + app code) |

### 3.11 Pipeline invocation

The main process does not fork a child process to run the pipeline. It calls the pipeline functions directly in the main Node.js process, since Electron's main process is a full Node.js environment.

Before invoking the pipeline, the main process:

1. Sets env vars from config: `ANTHROPIC_API_KEY`, `BROWSER_PROVIDER=stagehand-local`, `HEADLESS` (based on browserVisible setting).
2. Decrypts portal credentials from safeStorage.
3. Constructs a `ProviderConfig` object from the portal's stored config + decrypted credentials.
4. Monkey-patches or wraps `console.log` to also emit IPC events to the renderer.
5. Injects the OTP callback into the 2FA strategy.
6. Calls `extractProvider()` or `discoverPortal()` with the constructed config.

### 3.12 Concurrent operations

MVP: one operation at a time. If the user clicks Extract while Discovery is running (or vice versa), show a message: "Another operation is in progress. Please wait for it to complete."

Future: could support running operations on different portals in parallel (each with its own Playwright browser instance), but this adds complexity and resource usage.

## 4. What is NOT in MVP

- Windows support (Electron is cross-platform, but Playwright browser paths and signing differ — defer)
- Portal catalog (pre-populated list of known portals with URLs — not for MVP)
- Gmail auto-fetch for 2FA (keep the UI modal as the primary flow; Gmail IMAP is a power-user feature for later)
- Parallel multi-portal extraction
- Auto-discovery on portal add (user explicitly clicks Discover)
- Any server-side component
- Analytics or telemetry

## 5. Open Questions

- **Anthropic API costs.** Discovery is LLM-intensive (many `observe()` + `act()` calls). Should the app warn the user about estimated API costs before running discovery? Or is it negligible enough to not worry about? 

No, we should warn them.

- **Auth strategy override.** If auto-detection picks the wrong login form strategy, how does the user fix it? A dropdown in portal settings ("Login type: Two-step / Single-page") with a tooltip explaining the difference?

Yes


- **Session persistence across app restarts.** Current session.json has a 12h TTL. Should the Electron app try to restore sessions when re-opened, or always start fresh?

Start fresh


- **Re-discovery.** If a portal's layout changes and extraction starts failing, how does the user know to re-run discovery? Should the app suggest it automatically on repeated extraction failures?

Yes

## 6. Future versions

1. Allow user to specify some other AI model (e.g ChatGPT) and API key to run the browser. In the current version, keep naming etc. generic enough that making this change in the future is not a huge refactor.
