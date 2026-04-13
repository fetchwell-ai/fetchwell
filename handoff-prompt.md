# Next Session Prompt

Paste this into the Claude Code session window to start Phase 2.

---

We're continuing work on a MyChart browser agent. Phase 1 is now complete — the codebase has been refactored out of a spike prototype into a proper application structure.

**What was accomplished in the last session (Phase 1):**
- Full extraction validated: 36 labs, 12 visits, 1 medications, 28 messages (all complete, no crashes)
- `spike/src/` refactored into root `src/` with clean module splits:
  - `src/extract/{index,labs,visits,medications,messages,helpers}.ts`
  - `src/{auth,session,chat,imap,schemas,package}.ts`
  - `src/browser/` (BrowserProvider abstraction, unchanged)
- `pnpm extract` replaces `cd spike && pnpm spike`
- `pnpm package` creates a dated zip (`mychart-YYYY-MM-DD.zip`) with `metadata.json`
- All 77 records package cleanly to ~0.7 MB
- Zero TypeScript errors; everything committed and pushed

**Start by reading these files in order:**
1. `PRD.md` — product + engineering doc, phases, status
2. `ARCHITECTURE.md` — BrowserProvider abstraction, extraction pipeline
3. `handoff.md` — exactly what was done last session and what to do next

---

## Your job this session — follow this order. Do NOT write any code until I approve your plan.

### Step 1: Cleanup — delete spike/ and validate from new location

**Before touching anything, present me with your plan and wait for my approval.**

The `spike/` directory is still present as a safety backup from the refactor. The new pipeline lives in `src/`. Steps:

1. Run `pnpm extract` from the root to confirm all sections skip cleanly (records are already in `output/`)
2. Once validated, delete `spike/` and commit

**Prompt me when you're about to start the extraction run** — I may want to watch the output.

**Passing criteria for the extract run:**
- All sections skip (labs: 36, visits: 12, medications: 1, messages: 28 already in output/)
- `output/index.html` is rebuilt
- No crash or error

If anything fails, diagnose before deleting spike/.

**Commit immediately after deleting spike/**, with a clear message like:
`Remove spike/ — Phase 1 refactor complete, all source in src/`

---

### Step 2: Discuss Phase 2 plan before doing anything

Phase 2 is cloud deployment via Browserbase. The provider implementation already exists at `src/browser/providers/stagehand-browserbase.ts`. Before writing a single line of code, present me with:

1. A summary of what Phase 2 involves (what changes, what doesn't)
2. The exact steps you plan to take
3. Any risks or decisions that need my input

**Wait for my approval before proceeding.**

The current understanding of Phase 2 (from PRD.md section 13):
- Set `BROWSER_PROVIDER=browserbase` → orchestrator runs locally, browser runs in Browserbase cloud
- `StagehandBrowserbaseProvider` already implemented — may need minimal wiring
- Possible additions: Railway deployment for orchestrator, pre-signed S3/R2 for zip delivery, Browserbase Contexts for session persistence

---

## Ground rules for this session

- **Commit frequently** — after each meaningful change (e.g., after deleting spike/, after any code addition, after config changes). Commit messages should be descriptive enough to enable easy revert.
- **Wait for approval** before writing any code. Research and planning first, code second.
- **Prompt me for manual actions** — if you need me to run a browser, check credentials, test something in the UI, or approve an environment change, stop and ask.
- **Do NOT:**
  - Change `@ai-sdk/anthropic` away from `@1.x` (incompatible with Stagehand)
  - Update `@browserbasehq/stagehand` without checking model whitelist support
  - Modify the BrowserProvider interface without discussing first

**Key gotcha:** The Stagehand model setup uses a `Proxy` to inject `maxTokens: 16384` into `doGenerate`/`doStream` — this is required because Stagehand's `AISdkClient` doesn't pass `maxTokens`, causing 4096-token truncation. This pattern lives in `src/browser/providers/stagehand-local.ts` and must be preserved.
