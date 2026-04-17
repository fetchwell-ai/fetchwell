# MyChart Agent — Claude Code Instructions

## Project overview

AI agent that logs into Epic MyChart via browser automation, extracts health records as PDFs, and delivers merged PDF files ready to upload to Claude.ai. No APIs or FHIR — browser only.

- **PRD:** `PRD.md` — product requirements and feature specs
- **Plan:** `plan.MD` — current status, what's next, known issues

## Repository layout

```
browser-agent-team/
├── PRD.md               # Product requirements and feature specs
├── plan.MD              # Current status, what's next, known issues
├── docs/                # Reference docs (read on demand)
│   └── BROWSER_RESEARCH.md  # Browser automation tool research
├── src/
│   ├── extract/
│   │   ├── index.ts        # Main extraction pipeline (entry point)
│   │   ├── labs.ts         # extractLabsDocs() → output/labs/*.pdf + output/labs.pdf
│   │   ├── visits.ts       # extractVisits() → output/visits/*.pdf + output/visits.pdf
│   │   ├── medications.ts  # extractMedications() → output/medications.pdf
│   │   ├── messages.ts     # extractMessages() → output/messages/*.pdf + output/messages.pdf
│   │   └── helpers.ts      # Shared: slugify, makeItemFilename, mergePdfs, navigateWithRetry, buildIndex
│   ├── auth.ts          # doLogin, ensureLoggedIn, fetchGmailVerificationCode
│   ├── session.ts       # loadSavedSession, saveSession, clearSession
│   ├── 2fa-relay.ts     # Standalone Gmail IMAP 2FA helper
│   ├── imap.ts          # extractVerificationCode()
│   └── browser/
│       ├── interface.ts  # BrowserProvider abstraction
│       ├── index.ts      # Provider factory
│       ├── page-eval.ts  # Shared browser-side eval functions
│       └── providers/
│           ├── stagehand-local.ts    # Stagehand + local Chromium (default)
│           ├── stagehand-browserbase.ts  # Stagehand + Browserbase cloud
│           └── playwright-local.ts   # Plain Playwright, no AI
├── output/              # Runtime output — gitignored
│   ├── session.json     # Saved browser session (12h TTL, skip login on reuse)
│   ├── 2fa.code         # Drop a 6-digit code here to relay 2FA manually
│   ├── labs.pdf         # All lab results merged — upload to Claude.ai
│   ├── visits.pdf       # All visits merged — upload to Claude.ai
│   ├── medications.pdf  # Medication list — upload to Claude.ai
│   ├── messages.pdf     # All messages merged — upload to Claude.ai
│   ├── index.html       # Overview listing the 4 merged PDFs
│   ├── labs/            # Individual lab PDFs (one per panel)
│   ├── visits/          # Individual visit PDFs
│   ├── medications/     # (empty — single file goes to output/medications.pdf)
│   └── messages/        # Individual message thread PDFs
└── .env                 # Credentials — gitignored, see .env.example
```

## Running

```bash
pnpm extract    # Extract all records → output/*.pdf
```

Provide 2FA code manually (when Gmail auto-fetch fails):
```bash
echo "123456" > output/2fa.code
```

Delete saved session to force fresh login:
```bash
rm output/session.json
```

Force re-extraction of a specific section:
```bash
FORCE_LABS=1 pnpm extract
FORCE_VISITS=1 pnpm extract
FORCE_MEDS=1 pnpm extract
FORCE_MSGS=1 pnpm extract
```

## Output format

Each `pnpm extract` run produces 4 merged PDFs in `output/`:
- `labs.pdf` — all lab results and imaging reports (one PDF per panel, merged)
- `visits.pdf` — all visit notes (one PDF per visit, merged)
- `medications.pdf` — current medication list (single page)
- `messages.pdf` — all message threads (one PDF per thread, merged)

Upload all 4 to Claude.ai to analyze your records. Each is typically 1–10 MB.

## Key technical decisions

### Output format: PDF-only
All records are captured as PDFs using Playwright's `page.pdf()`. This solves two problems:
1. **Scroll**: `page.pdf()` captures full page height regardless of scroll position
2. **Async content**: `waitForLoadState("networkidle")` is called before capture so AJAX-loaded content (imaging reports, etc.) is present

### BrowserProvider abstraction
All browser operations go through the `BrowserProvider` interface (`src/browser/interface.ts`). Three implementations, selected via `BROWSER_PROVIDER` env var:
- `stagehand-local` (default) — local Chromium + Stagehand + Claude
- `browserbase` — cloud Chromium via Browserbase + Stagehand + Claude
- `local` — plain Playwright, no AI (brittle, rarely used)

Swap providers without changing any extraction logic.

### Extraction pipeline pattern
Each extraction section (labs, visits, medications, messages):
1. Calls `ensureLoggedIn()` before navigating — long crawls can expire the server-side session
2. Checks for existing `.pdf` files and skips if present (use `FORCE_*=1` env vars to override)
3. Navigates the list page, calls `observe()` to find items, loops to click + capture each as a PDF
4. Merges per-item PDFs into a single `output/{section}.pdf` via `mergePdfs()`

### Stagehand model setup
Stagehand v2.5.8's built-in model whitelist only contains retired Claude 3.7 models — bypass it using `AISdkClient` + Proxy. See `src/browser/providers/stagehand-local.ts` for the pattern.

`@ai-sdk/anthropic` must be `@1.x` (not `@3.x`) — Stagehand's internal `ai@4.x` requires AI SDK spec v1.

### UCSF MyChart login is two-step
Username → click Next → password page → Sign In. Any new MyChart target may differ.

### Session persistence
Cookies saved to `output/session.json` after successful login. Auto-restored on next run (12h TTL). Skips login + 2FA entirely when valid.

### 2FA relay
The extraction pipeline watches `output/2fa.code` via `fs.watch` + 10s poll fallback. When the file appears, it reads the code and types it into the browser via `act()`. See `src/auth.ts`.

Two past bugs fixed in the Gmail IMAP auto-fetch path (`src/imap.ts`):
- IMAP `since` filter has date-only semantics and can exclude same-day emails — removed; filter by `envelope.date` in code instead
- SMTP routing IDs in email headers can match a bare 6-digit regex — skip headers, use context-aware patterns first

### Deprecated: pnpm chat
The built-in Claude chat feature has been removed. Upload the PDF output directly to Claude.ai instead — it reads PDFs natively and can analyze all records in a single session.

## Environment variables

See `.env.example`. Key vars:
- `ANTHROPIC_API_KEY` — required for AI browser actions
- `MYCHART_URL` — target MyChart login URL
- `MYCHART_USERNAME` / `MYCHART_PASSWORD` — optional, skips stdin prompts
- `GMAIL_USER` / `GMAIL_APP_PASSWORD` — optional, enables auto-2FA via Gmail IMAP
- `BROWSER_PROVIDER` — `stagehand-local` (default), `browserbase`, or `local`
- `FORCE_LABS`, `FORCE_VISITS`, `FORCE_MEDS`, `FORCE_MSGS` — set to `1` to re-extract that section


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
