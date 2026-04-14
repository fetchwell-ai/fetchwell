# Next Session Kickoff Prompt

Paste this into the Claude Code session window to start the next session.

---

We're continuing work on a MyChart browser agent. This session has two goals: (1) validate PDF extraction for visits/medications/messages, and (2) if that goes well, begin Phase 2 (Browserbase cloud browser).

**Start by reading these files in order:**
1. `PRD.md` — product + engineering doc, phases, status
2. `ARCHITECTURE.md` — BrowserProvider abstraction, extraction pipeline
3. `handoff.md` — exactly what was done last session and what to do next
4. `src/extract/labs.ts` — reference implementation for the PDF capture pattern
5. `src/browser/providers/stagehand-browserbase.ts` — what needs fixing for Phase 2

---

## What was accomplished last session

### Cleanup
- Deleted `spike/` (validated clean run first)
- Deleted `src/chat.ts` — `pnpm chat` deprecated in favor of Claude.ai + PDF upload

### Major refactor: PDF-only output
- All records now captured as PDFs via Playwright `page.pdf()`
- Added `waitForLoadState("networkidle")` before capture — fixes blank imaging reports (async AJAX content now present)
- Each section produces: per-item PDFs in a subdirectory + one merged PDF at `output/{section}.pdf`
- `labs.pdf` validated: 36 records (including imaging reports), 4.5 MB, content confirmed present in formerly-blank radiology reports
- `visits.pdf`, `medications.pdf`, `messages.pdf` — code is in place but files haven't been re-extracted yet (old HTML/JSON files deleted)
- Removed: HTML capture, JSON structured extraction, `schemas.ts`, `package.ts`, `archiver`, zip output
- Only command remaining: `pnpm extract`

---

## Your job this session — follow this order. Do NOT write any code until I approve your plan.

### Step 1: Validate visits, medications, messages PDF extraction

**Before running anything, present me with your plan and wait for my approval.**

The PDF extraction code for visits, messages, and medications was written last session but not yet run. The old HTML/JSON files were deleted. Run re-extraction:

```bash
FORCE_VISITS=1 FORCE_MEDS=1 FORCE_MSGS=1 pnpm extract
```

**Prompt me before starting the run** — I may want to watch the output.

**Passing criteria:**
- `output/visits.pdf` created and openable
- `output/medications.pdf` created and openable
- `output/messages.pdf` created and openable
- No crashes or errors during extraction

**After the run:** Let me check the PDFs before proceeding. I'll tell you if anything looks wrong.

---

### Step 2: Discuss Phase 2 plan before doing anything

Phase 2 is cloud deployment via Browserbase. Before writing a single line of code, present me with:

1. A summary of what needs to change in `StagehandBrowserbaseProvider` (there are 4 known gaps — see `handoff.md`)
2. The exact steps you plan to take
3. Any risks or decisions that need my input

**Wait for my approval before proceeding.**

Known gaps in the Browserbase provider (`src/browser/providers/stagehand-browserbase.ts`):
- Missing `pdf()` method (needed for PDF capture)
- Missing `saveSession()`/`loadSession()` (needed for cookie persistence)
- Missing `{ iframes: true }` on `act()`/`extract()`/`observe()` (MyChart uses iframes)
- Model whitelist behavior unknown in BROWSERBASE mode — may work as-is, test first

---

## Ground rules for this session

- **Commit frequently** — after each meaningful change. Commit messages should be descriptive enough to enable easy revert.
- **Wait for my approval** before writing any code. Research and planning first, code second.
- **Prompt me for manual actions** — if you need me to run a browser, check credentials, review a PDF, test something in the UI, or approve an environment change, stop and ask.
- **Do NOT:**
  - Change `@ai-sdk/anthropic` away from `@1.x` (incompatible with Stagehand)
  - Update `@browserbasehq/stagehand` without checking model whitelist support
  - Modify the BrowserProvider interface without discussing first
  - Add back HTML, JSON, or zip output (we are 100% PDF now)

**Key pattern to preserve:** The Stagehand model setup uses a `Proxy` to inject `maxTokens: 16384` into `doGenerate`/`doStream` — required because Stagehand's `AISdkClient` doesn't pass `maxTokens`. Lives in `src/browser/providers/stagehand-local.ts`. Must be preserved.

**Key PDF capture pattern** (preserve this in all extractors):
```typescript
await browser.act(`Click the element: ${link.description}`);
await new Promise((r) => setTimeout(r, 1000));
try { await browser.waitFor({ type: "networkIdle" }); } catch {}
if (browser.pdf) {
  const pdfBuf = await browser.pdf();
  fs.writeFileSync(path.join(dir, filename), pdfBuf);
}
```
