# FetchWell

FetchWell is a macOS app that downloads your health records from patient portals as PDFs to your computer.

It uses an AI assistant (Anthropic's Claude) to open a browser, log into your portal, navigate to your labs, visits, medications, and messages, and save each record as a PDF. Everything is stored locally in a folder you choose.

## How it works

1. **Add a portal** — Paste the URL of your provider's patient portal and enter your login credentials. Credentials are encrypted and stored in your macOS Keychain.
2. **FetchWell maps the portal** — An AI assistant opens the portal in a browser and learns where your records are. This happens once per portal.
3. **Records arrive as PDFs** — Click "Fetch records" to download. Files are saved to your chosen folder, organized by category. Run it again anytime to get new records.

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

- macOS (Apple Silicon)
- A patient portal (tested with Epic-based portals; others may work)

An Anthropic API key is bundled with the app. You can also use your own key in Settings.

## Two-factor authentication

If your portal requires 2FA, FetchWell will prompt you to enter the verification code during sign-in. It prefers SMS delivery when available.

## CLI

FetchWell also works from the command line:

```bash
npm install -g fetchwell

fetchwell-ai fetch                       # Extract all records
fetchwell-ai fetch --provider stanford   # Extract for a specific portal
fetchwell-ai fetch --incremental         # Only fetch new records
```

CLI mode requires an `ANTHROPIC_API_KEY` in `.env` and a `providers.json` file. See `.env.example` and `providers.example.json`.

## Development

```bash
pnpm install              # Install dependencies
pnpm electron:dev         # Launch the dev app
pnpm test:unit            # Run unit tests
pnpm typecheck            # TypeScript check
pnpm dist                 # Build a signed DMG
```

## License

[BSL 1.1](LICENSE.md) — free for non-commercial use. See the license file for details.
