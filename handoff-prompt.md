# Next Session Prompt

Paste this into the Claude Code session window to start Phase 1.

---

We're continuing work on a MyChart browser agent. Phase 0 is complete — the agent successfully logs into Epic MyChart, auto-handles 2FA via Gmail, and extracts labs (36), visits (12), medications (1), and messages (13/28 — partial) as HTML documents with a browsable index and an interactive Claude chat interface.

**Start by reading these files in order:**

1. `PRD.md` — merged product + engineering doc. Covers what we're building, the phase plan, current status, and technical decisions.
2. `ARCHITECTURE.md` — BrowserProvider abstraction, extraction pipeline, session handling.
3. `handoff.md` — what was done last session and exactly what to do next.

**Your job in this session is Phase 1:**

1. **Run `/simplify` on `spike/src/`** — code quality review on the extraction pipeline. Apply reasonable suggestions before the refactor.

2. **Refactor the project structure** — the "spike" is the real product now. Move everything out of `spike/` into the root:
   - `spike/src/` → `src/`
   - `spike/package.json` → `package.json` (root)
   - Split the monolithic `spike.ts` (~900 lines) into `src/extract/index.ts`, `src/extract/labs.ts`, `src/extract/visits.ts`, `src/extract/medications.ts`, `src/extract/messages.ts`
   - Update the `pnpm spike` script → `pnpm extract`
   - Verify `pnpm extract` and `pnpm chat` still work end-to-end

3. **Validate the messages fix** — a `navigateWithRetry()` + per-thread resume fix was committed last session but never validated. After the refactor, run `pnpm extract` to verify all 28 message threads are extracted without the network timeout crash.

4. If time: **zip packaging** — `pnpm package` that bundles `output/` into a dated zip with a `metadata.json`.

**Do NOT:**
- Change `@ai-sdk/anthropic` away from `@1.x` (incompatible with Stagehand)
- Update `@browserbasehq/stagehand` without checking model whitelist support
- Modify the BrowserProvider interface or provider implementations unless the simplify review specifically calls for it

**Key gotcha:** `spike.ts` has a `navigateWithRetry()` helper and `itemAlreadySaved()` helper that were just added. Keep these patterns in the refactored code.
