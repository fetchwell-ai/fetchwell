# Next Session Prompt

Paste this into the Claude Code session window to start Phase 1.

---

We're continuing work on a MyChart browser agent. Phase 0 is complete — the agent successfully logs into Epic MyChart, auto-handles 2FA via Gmail, and extracts labs (36), visits (12), medications (1), and messages (13/28 — partial) as HTML documents with a browsable index and an interactive Claude chat interface.

**Start by reading these files in order:**

1. `PRD.md` — merged product + engineering doc. Covers what we're building, the phase plan, current status, and technical decisions.
2. `ARCHITECTURE.md` — BrowserProvider abstraction, extraction pipeline, session handling.
3. `handoff.md` — what was done last session and exactly what to do next.

**Your job in this session — follow this order strictly:**

### Step 1: Run a full validated extraction (do this FIRST, before any code changes)

A messages network-timeout fix was committed last session but never validated. Run the extraction to confirm it works:

```bash
cd spike
pnpm spike
```

The existing session may be expired. The agent will re-authenticate automatically via Gmail. If Gmail 2FA times out and prompts for manual input, drop the code:
```bash
echo "XXXXXX" > output/2fa.code
```

**Watch for:** Labs (36 HTML), Visits (12 HTML), Medications (1 HTML) will all be skipped (already saved). The run should resume messages at thread 14 and complete all 28.

**Passing criteria:** `output/messages/` has 28 HTML files. No crash. `output/index.html` was rebuilt.

**If messages still fail at thread 13-14:** Do NOT proceed to the refactor. Diagnose the error first — check whether it's a transient network issue or a bug in `navigateWithRetry`. Fix, commit, and re-run until the full 28 threads extract cleanly.

Do not move to Step 2 until Step 1 passes.

---

### Step 2: Code review with /simplify

Once the full run passes, run `/simplify` on `spike/src/` for a code quality review. Apply reasonable suggestions. Key things to watch:
- `spike.ts` is ~900 lines and should be split into extraction modules
- `navigateWithRetry` and `itemAlreadySaved` (just added) are good patterns to keep
- `chat.ts` is clean — minimal changes expected

### Step 3: Refactor project structure (spike/ → root)

The "spike" is the real product now. Move everything out of `spike/` into the root:
- `spike/src/` → `src/`
- `spike/package.json` → `package.json` (root)
- Split `spike.ts` into `src/extract/index.ts`, `src/extract/labs.ts`, `src/extract/visits.ts`, `src/extract/medications.ts`, `src/extract/messages.ts`
- Rename `pnpm spike` → `pnpm extract`
- Verify `pnpm extract` and `pnpm chat` still work end-to-end after the move

### Step 4 (if time): Zip packaging

`pnpm package` that bundles `output/` into a dated zip with a `metadata.json`.

**Do NOT:**
- Change `@ai-sdk/anthropic` away from `@1.x` (incompatible with Stagehand)
- Update `@browserbasehq/stagehand` without checking model whitelist support
- Modify the BrowserProvider interface or provider implementations unless the simplify review specifically calls for it

**Key gotcha:** `spike.ts` has a `navigateWithRetry()` helper and `itemAlreadySaved()` helper that were just added. Keep these patterns in the refactored code.
