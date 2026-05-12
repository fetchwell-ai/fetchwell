# FetchWell

FetchWell is a macOS app that downloads your health records from patient portals as PDFs to your computer.

It uses an AI assistant (Anthropic's Claude) to open a browser, log into your portal, navigate to your labs, visits, medications, and messages, and save each record as a PDF. Everything is stored locally in a folder you choose.

## How it works

1. **Add a portal** — Paste the URL of your provider's patient portal and enter your login credentials. Credentials are encrypted and stored in your macOS Keychain.
2. **Fetch records** — Click "Fetch records." An AI assistant opens the portal in a browser, finds your records, and downloads them as PDFs to a folder you choose. On the first run it learns the portal layout; subsequent runs are faster.

## What it extracts

| Category | Description |
|---|---|
| **Lab results** | Individual lab reports as full-page PDFs |
| **Visit notes** | After-visit summaries and clinical notes |
| **Medications** | Current medication list |
| **Messages** | Patient-provider message threads |

## Privacy and data

FetchWell has no servers and no cloud. Your records are downloaded directly to your Mac as PDFs, and your passwords are encrypted in your macOS Keychain.

To navigate your portal, FetchWell uses Claude, an AI assistant made by Anthropic. During extraction, page content — including health information visible on screen — is sent to Anthropic's API so Claude can read and interact with the site. As of March 2026, Anthropic does [not use API data](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training) to train its models.

FetchWell is not affiliated with Anthropic.

## Install

Download the latest `.dmg` from [GitHub Releases](https://github.com/fetchwell-ai/fetchwell/releases/latest), open it, and drag FetchWell to Applications.

### Requirements

- macOS (Apple Silicon — arm64)
- A patient portal 

An Anthropic API key is bundled with the app. You can also add your own key in Settings.

## Two-factor authentication

If your portal requires two-factor authentication, FetchWell will detect it and prompt you to enter the verification code in the app. 

## CLI usage

If you prefer the command line, you can run FetchWell without the Electron app. Clone the repo and set up a `.env` file and `providers.json` (see `.env.example` and `providers.example.json`).

```bash
pnpm install

# Add your Anthropic API key to .env
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# Configure your portals in providers.json (see providers.example.json)

# Extract all records for all configured portals
pnpm extract

# Extract for a specific portal
pnpm extract --provider stanford

# Only fetch records newer than last run
pnpm extract --incremental
```

The CLI handles 2FA via a file-based relay — when a code is needed, it prompts in the terminal.

## Development

```bash
pnpm install              # Install dependencies
pnpm electron:dev         # Launch the dev app
pnpm test:unit            # Run unit tests
pnpm typecheck            # TypeScript check
pnpm dist                 # Build a signed DMG
```

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md) — free for non-commercial use. See the license file for details.
