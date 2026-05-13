# FetchWell

FetchWell is an open-source macOS desktop app that logs into your patient portals and downloads your health records as PDFs to a local folder.

I built this because I wanted to share all of my health data with Claude so it could help me make sense of it. But there is no reliable way to get your health data in bulk without doing a bunch of manual work. Fancy technologies like FHIR APIs and HIEs exist for your doctors to use, but they are not available to patients. The one place patients *can* access their records is through web portals like Epic MyChart, but these are designed for human use, not automated downloads. Some people have built tools to "scrape" these sites, but that approach requires a lot of customization for different portals and can break when websites change.

FetchWell takes a different approach. Instead of scraping the source code of web pages, it uses an AI agent (Anthropic's Claude) to drive a real browser the same way a human would: by reading the page, clicking links and downloading PDFs. This makes it resilient to portal redesigns and not tied to any single EHR vendor. If you can log in and see your records, FetchWell can extract them.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Electron Main Process                               │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│
│  │ ConfigManager │  │  Credentials │  │  Pipeline   ││
│  │  (config.json)│  │  Manager     │  │  Bridge     ││
│  │              │  │ (safeStorage)│  │ (fork + IPC)││
│  └──────────────┘  └──────────────┘  └──────┬──────┘│
└─────────────────────────────────────────────┼────────┘
                                              │ fork()
┌─────────────────────────────────────────────▼────────┐
│  Extraction Subprocess (tsx, ESM)                     │
│  ┌─────────────┐  ┌────────────────┐  ┌────────────┐│
│  │ Auth Module  │  │ Discovery      │  │ Extractors ││
│  │ (composable  │  │ (agentic loop: │  │ (labs,     ││
│  │  strategies) │  │  act + extract)│  │  visits,   ││
│  └──────┬──────┘  └───────┬────────┘  │  meds,     ││
│         │                 │           │  messages)  ││
│         └────────┬────────┘           └──────┬─────┘│
│                  │                           │       │
│          ┌───────▼───────────────────────────▼──┐   │
│          │  BrowserProvider (Stagehand + Playwright) │
│          │  • act(instruction) → Claude navigates    │
│          │  • extract(schema)  → Claude reads data   │
│          │  • page.pdf()       → full-page PDF       │
│          └──────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  Electron Renderer (React + Vite + Tailwind v4)      │
│  Sidebar │ Portal List │ Portal Detail │ Settings     │
│  Progress Panel │ 2FA Modal │ Error Summary           │
└──────────────────────────────────────────────────────┘
```

**Electron** hosts the app. The main process manages config, encrypted credentials (via macOS `safeStorage`), and a pipeline bridge that forks the extraction subprocess with IPC for progress events, 2FA relay, and error reporting.

**Playwright** drives a real Chromium browser. The Chromium binary is bundled in the app (~200 MB) so end users don't need to install anything.

**Stagehand** (via the Vercel AI SDK) wraps Playwright with AI-powered `act()` and `extract()` methods. `act("Click the lab results link")` sends a screenshot + instruction to Claude, which returns the DOM action to take. `extract(zodSchema, instruction)` reads structured data from the page.

**Auth** is composable: two independent strategy axes — login form type (`auto` | `two-step` | `single-page`) and 2FA method (`none` | `manual` | `ui`). Login form type is auto-detected on first run and cached. The Electron app uses the `ui` strategy, which shows an in-app modal for verification codes.

**Discovery** is an agentic loop that maps a portal's navigation structure into a `nav-map.json` — cached URLs and replay steps for each section. Extraction uses a 3-tier fallback: cached URL, replay steps, then fresh agentic search.

**Sessions** persist browser cookies for 12 hours, skipping login and 2FA on subsequent runs.

## What it extracts

| Category | Description |
|---|---|
| **Lab results** | Individual lab reports as full-page PDFs |
| **Visit notes** | After-visit summaries and clinical notes |
| **Medications** | Current medication list |
| **Messages** | Patient-provider message threads |

## Privacy and data

FetchWell has no servers and no cloud. Your records are downloaded directly to your Mac as PDFs, and your passwords are encrypted in your macOS Keychain via Electron's `safeStorage` API. Plaintext credentials never leave the main process — the renderer only receives a boolean indicating whether a password is stored.

To navigate your portal, FetchWell uses Claude, an AI assistant made by Anthropic. During extraction, page content — including health information visible on screen — is sent to Anthropic's API so Claude can read and interact with the site. As of March 2026, Anthropic does [not use API data](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training) to train its models.

FetchWell is not affiliated with Anthropic.

## Install

**[Download FetchWell for macOS](https://github.com/fetchwell-ai/fetchwell/releases/latest/download/FetchWell-0.1.0-arm64.dmg)** (arm64, ~350 MB)

Or browse all releases on [GitHub Releases](https://github.com/fetchwell-ai/fetchwell/releases/latest). Open the `.dmg` and drag FetchWell to Applications.

### Requirements

- macOS (Apple Silicon — arm64)
- A patient portal

An Anthropic API key is bundled with the app. You can also add your own key in Settings. When building from source, supply your own key via `ANTHROPIC_API_KEY` in `.env`. The bundled key is only included in official releases.

## Two-factor authentication

If your portal requires two-factor authentication, FetchWell will detect it and prompt you to enter the verification code in the app. The agent prefers SMS delivery over email when both are available.

## CLI usage

If you prefer the command line, you can run FetchWell without the Electron app. Clone the repo and set up a `.env` file and `providers.json` (see `.env.example` and `providers.example.json`).

```bash
pnpm install

# Add your Anthropic API key to .env
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# Copy the example config and add your portals
cp providers.example.json providers.json
```

Edit `providers.json` with your portal details:

```json
{
  "providers": [
    {
      "id": "stanford",
      "name": "Stanford MyChart",
      "type": "mychart",
      "url": "https://mystanfordchart.stanfordhealthcare.org/MyChart/Authentication/Login",
      "username": "your-username",
      "password": "your-password",
      "auth": {
        "loginForm": "auto",
        "twoFactor": "none"
      }
    }
  ]
}
```

| Field | Description |
|---|---|
| `id` | Short identifier used for output folder names and the `--provider` flag |
| `name` | Display name (used in logs) |
| `type` | Portal type — `mychart` for Epic-based portals |
| `url` | Login page URL for the portal |
| `username` | Your portal username or email |
| `password` | Your portal password |
| `auth.loginForm` | `auto` (detect at runtime), `two-step` (username then password), or `single-page` (both on one form) |
| `auth.twoFactor` | `none` or `manual` (prompted in terminal) |

Then run:

```bash
pnpm extract                          # Extract all portals
pnpm extract --provider stanford      # Extract one portal
pnpm extract --incremental            # Only fetch new records
```

Records are saved to `output/<provider-id>/`.

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron (context-isolated, CJS main + ESM renderer) |
| Browser automation | Playwright (bundled Chromium) |
| AI agent | Stagehand + Vercel AI SDK + Anthropic Claude |
| Renderer | React 19, Vite, Tailwind CSS v4, Framer Motion, shadcn/ui |
| Config validation | Zod (provider config, IPC inputs, session schemas) |
| Credentials | Electron `safeStorage` (macOS Keychain encryption) |
| PDF generation | `page.pdf()` full-page capture + pdf-lib for merging |
| Testing | Vitest (unit), Playwright (E2E Electron tests) |

## Development

```bash
pnpm install              # Install dependencies
pnpm electron:dev         # Launch the dev app
pnpm test:unit            # Run unit tests (159 tests, <1s)
pnpm typecheck            # TypeScript check
pnpm dist                 # Build a macOS DMG (signed if CSC_NAME is configured)
```

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md) — free for non-commercial use. See the license file for details.
