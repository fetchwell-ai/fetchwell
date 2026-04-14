# Handoff — PDF Migration Complete / Phase 2 Prep

**Date:** 2026-04-13
**For:** Next Claude Code session

---

## What was accomplished in this session

### Cleanup
- ✅ Deleted `spike/` directory (validated clean extraction run first)
- ✅ `pnpm chat` deprecated and `src/chat.ts` deleted — superseded by Claude.ai + PDF upload

### PDF output migration (major refactor)
- ✅ Added `pdf()` to `BrowserProvider` interface + implemented in `StagehandLocalProvider` via `page.pdf()`
- ✅ Added `waitForLoadState("networkidle")` before capture in all extractors — fixes imaging reports that previously rendered blank (`InternalReportViewerWrapper` AJAX content now loads before capture)
- ✅ `labs`: PDF-only extraction, 36 PDFs merged into `output/labs.pdf` (4.5 MB — **validated and confirmed working**)
- ✅ `visits`, `messages`: refactored to PDF, per-item PDFs + merged section PDF
- ✅ `medications`: single-page PDF saved directly to `output/medications.pdf`
- ✅ Removed all HTML capture (`savePageAsHtml`, `DOC_CSS` gone from helpers)
- ✅ Removed all JSON structured extraction from visits, messages, medications
- ✅ Deleted `src/schemas.ts` (LabPanel, Visit, Medication, Message — nothing uses them)
- ✅ Deleted `src/package.ts` + removed `archiver` dependency + `pnpm package` script — zip replaced by merged PDFs
- ✅ Removed legacy `extractLabsJson` (30-panel JSON drill-down step)
- ✅ `buildIndex()` updated to list the 4 merged PDFs instead of HTML files
- ✅ Cleaned up `output/` — deleted all old HTML, JSON, zip files
- ✅ Added shared `mergePdfs()` helper in `helpers.ts`

### Commits pushed this session
All commits pushed to `origin/main`. Run `git log --oneline` to see the full list.

---

## What to do next (in order)

### 1. Validate visits, messages, medications PDF extraction

Labs PDF was validated this session. The other three sections still have their OLD files deleted and need to be re-extracted as PDFs:

```bash
FORCE_VISITS=1 FORCE_MEDS=1 FORCE_MSGS=1 pnpm extract
```

**Passing criteria:**
- `output/visits.pdf` created, opens cleanly, visit notes readable
- `output/medications.pdf` created, medication list visible
- `output/messages.pdf` created, message threads readable
- No crashes

**Before running:** prompt the user — they may want to watch the output.

### 2. Review PDF quality

Have the user check the PDFs:
- Do imaging reports now have content (previously blank with async loading)?
- Are blood work panels readable?
- Is there any MyChart UI chrome that should be trimmed (print CSS)?
- Are all pages legible when uploaded to Claude.ai?

### 3. Phase 2 — Browserbase cloud browser (NEXT MAJOR WORK)

The groundwork is done — `StagehandBrowserbaseProvider` is implemented in `src/browser/providers/stagehand-browserbase.ts`. Two known issues to fix before it will work:

**Bug 1 — Model whitelist (unknown if issue in BROWSERBASE mode):**
The Browserbase provider uses `modelName: "claude-sonnet-4-6"` + `modelClientOptions`. In LOCAL mode this would fail (Stagehand's whitelist blocks it), but BROWSERBASE mode routes the LLM through Browserbase's infra. May work as-is — test first before changing.

**Bug 2 — Missing `saveSession()`/`loadSession()`:**
Browserbase provider doesn't implement these. For Phase 2 step 1 (cloud browser, local orchestrator), add cookie-based session persistence using the same pattern as the local provider. Longer term: use Browserbase Contexts.

**Bug 3 — Missing `pdf()` method:**
The Browserbase provider doesn't implement `pdf()`. Add it: `return this.stagehand.page.pdf({ format: "A4", printBackground: true })`.

**Bug 4 — Missing `iframes: true`:**
Local provider passes `{ iframes: true }` to `act()`/`extract()`/`observe()`. Browserbase provider doesn't. May be needed for MyChart.

**To activate Browserbase:**
1. Set `BROWSER_PROVIDER=browserbase` in `.env`
2. Add `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` to `.env`
3. Fix the bugs above
4. Run `pnpm extract` and watch for errors

---

## Known issues / gotchas

**`pdf()` not implemented in Browserbase provider:**
`StagehandBrowserbaseProvider` doesn't have `pdf()` yet. Will silently skip PDF capture if used. Add before Phase 2 testing.

**Stagehand model whitelist:**
Do NOT update `@browserbasehq/stagehand` without checking if new version has better model support. The AISdkClient + Proxy pattern in `src/browser/providers/stagehand-local.ts` must be preserved until Stagehand natively supports `claude-sonnet-4-6`.

**`@ai-sdk/anthropic` version:**
Must stay at `@1.x`. The `@3.x` package (AI SDK spec v2) is incompatible with Stagehand's internal `ai@4.x`.

**Gmail 2FA polling is slow on first poll:**
First IMAP search can take 2-3 minutes if there are many old emails. `checkedUids` tracking prevents re-fetching on subsequent polls.

---

## Files to read first in next session

1. `PRD.md` — merged product + engineering doc
2. `ARCHITECTURE.md` — system architecture
3. `handoff.md` — this file
4. `src/extract/labs.ts` — reference implementation for PDF capture pattern
5. `src/browser/providers/stagehand-browserbase.ts` — what needs fixing for Phase 2
