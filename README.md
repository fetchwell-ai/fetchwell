# FetchWell

A macOS desktop app that downloads your health records as PDFs from patient portals like Epic MyChart. No cloud servers, no accounts, no data leaves your Mac.

FetchWell runs an AI agent that logs into your portal in a real browser, navigates to your labs, visits, medications, and messages, and saves everything as clean PDFs to a local folder. You can then upload those PDFs to Claude, your doctor, or anywhere else.

## How it works

1. **Add a portal** — Paste the URL of your provider's patient portal and enter your login credentials. Credentials are stored in macOS Keychain, encrypted and local-only.
2. **FetchWell learns the portal** — An AI agent opens a hidden browser, explores the portal's navigation, and maps out where your records live. This happens once per portal.
3. **Records arrive as PDFs** — Click "Fetch records" whenever you want fresh copies. Files land in your chosen folder, organized by date and section.

## Privacy

FetchWell runs entirely on your Mac. There's no FetchWell account, no server we own that touches your data, and no analytics watching what you fetch. The only thing that ever leaves your machine is the back-and-forth with the AI that drives the agent — and you bring your own key.

## Install

### Download

Download the latest `.dmg` from [GitHub Releases](https://github.com/fetchwell-ai/fetchwell/releases/latest), open it, and drag FetchWell to Applications.

### Requirements

- macOS (Apple Silicon or Intel)
- An [Anthropic API key](https://console.anthropic.com/) — FetchWell uses Claude to power the browser agent
- A patient portal that uses Epic MyChart (other portal types may work but are untested)

## Setup

1. Launch FetchWell
2. Enter your Anthropic API key in Settings
3. Click "Add portal" and paste your provider's MyChart URL (e.g., `https://mychart.stanfordhealthcare.org/MyChart`)
4. Enter your portal username and password
5. Click "Fetch records"

On the first run, FetchWell will discover the portal's layout and then extract your records. Subsequent runs are faster — it remembers the portal structure and reuses your session.

## What it extracts

| Category | Description |
|---|---|
| **Lab results** | Individual lab reports as full-page PDFs |
| **Visit notes** | After-visit summaries and clinical notes |
| **Medications** | Current medication list |
| **Messages** | Patient-provider message threads |

Use `--incremental` (CLI) or enable "Only fetch new records" in Settings to skip records you've already downloaded.

## CLI

FetchWell also works from the command line:

```bash
# Install globally
npm install -g fetchwell

# Extract all records for all configured portals
fetchwell-ai fetch

# Extract for a specific portal
fetchwell-ai fetch --provider stanford

# Only fetch records newer than last run
fetchwell-ai fetch --incremental
```

CLI mode requires a `.env` file with your `ANTHROPIC_API_KEY` and a `providers.json` file. See `.env.example` and `providers.example.json` for the format.

## Two-factor authentication

FetchWell supports several 2FA methods:

| Method | How it works |
|---|---|
| **None** | Portal doesn't require 2FA (e.g., Stanford MyChart) |
| **UI prompt** | FetchWell pauses and asks you to enter the code in the app |
| **Email** | Automatically reads the verification code from your Gmail (requires an [app-specific password](https://myaccount.google.com/apppasswords)) |

Configure the 2FA method per portal in the app or in `providers.json`.

## Development

```bash
# Install dependencies
pnpm install

# Launch the dev app
pnpm electron:dev

# Run tests
pnpm test:unit        # 119 unit tests, <1s
pnpm typecheck        # TypeScript check

# Build a DMG
pnpm dist
```

### Project structure

```
src/extract/     Extraction pipeline (labs, visits, medications, messages)
src/discover/    AI-powered portal discovery engine
src/auth/        Composable auth system (login form + 2FA strategies)
src/browser/     Browser provider abstraction (Stagehand or plain Playwright)
src/renderer/    React UI (Vite, Tailwind CSS v4, shadcn/ui)
electron/        Electron main process, IPC handlers, config storage
```

### Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Powers the AI browser agent |
| `BROWSER_PROVIDER` | No | `stagehand-local` (default) or `local` (plain Playwright) |
| `GMAIL_USER` | No | Gmail address for email-based 2FA |
| `GMAIL_APP_PASSWORD` | No | Gmail app-specific password for 2FA |

## License

[BSL 1.1](LICENSE.md) — free for non-commercial use. See the license file for details.
