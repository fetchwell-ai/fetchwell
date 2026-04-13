# Handoff — Phase 1 Complete / Phase 2 Prep

**Date:** 2026-04-13  
**For:** Next Claude Code session

---

## What was accomplished in this session

Phase 1 (Refactor + Stabilize) is complete:

- ✅ Validation run confirmed: 36 labs, 12 visits, 1 medications, **28 messages** (full extraction clean)
- ✅ Simplify pass already done last session (commit: "Simplify: extract shared helpers, remove N+1 dir reads, parallelize async calls")
- ✅ Refactored `spike/` → root `src/` with proper module splits:
  - `src/extract/{index,labs,visits,medications,messages,helpers}.ts`
  - `src/{auth,session,chat,imap,schemas,package}.ts`
  - `src/browser/` (unchanged from spike)
- ✅ `pnpm extract` replaces `cd spike && pnpm spike`
- ✅ `pnpm package` creates `mychart-YYYY-MM-DD.zip` with metadata.json (tested: 77 records, 0.7 MB)
- ✅ Existing extracted records moved from `spike/output/` → `output/`
- ✅ Zero TypeScript errors, committed

---

## What to do next (Phase 2 priority order)

### 1. Delete spike/ (cleanup)

The `spike/` directory is still present as a safety backup. Once you've verified `pnpm extract` completes a clean run from the new location, delete it:

```bash
rm -rf spike/
git add -A
git commit -m "Remove spike/ — refactored into root src/"
```

**Note:** The new `pnpm extract` will write to `output/` at the root (not `spike/output/`). The session file is now at `output/session.json`. A fresh login will be needed on the first run since the spike session was already expired.

### 2. Full validation run from new location

Run `pnpm extract` from the root (not from inside spike/):

```bash
pnpm extract
```

**Passing criteria:**
- All sections skip (already saved in output/)  
- `output/index.html` is rebuilt
- No crash

If the session has expired, the agent will re-authenticate automatically.

### 3. Phase 2 — Cloud Deployment (Browserbase)

The groundwork is already done:
- `StagehandBrowserbaseProvider` is implemented in `src/browser/providers/stagehand-browserbase.ts`
- Set `BROWSER_PROVIDER=browserbase` in `.env`
- Add `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` to `.env`
- No other code changes needed

Next steps for Phase 2:
- Deploy orchestrator to Railway (runs locally → runs in cloud)
- Store session cookies in Browserbase Contexts for persistence
- Pre-signed S3/R2 URL for zip delivery

### 4. Phase 1.4 — Proper CLI (optional)

```bash
mychart-agent fetch       # pnpm extract
mychart-agent chat        # pnpm chat
mychart-agent package     # pnpm package
mychart-agent fetch --section labs  # FORCE_LABS=1 pnpm extract
```

---

## Known issues / gotchas

**spike/ still present:**
- It's safe to delete after a successful `pnpm extract` run from the root
- Don't need to migrate anything — records are already in `output/`

**Stagehand model whitelist:**
- Do NOT update `@browserbasehq/stagehand` without checking if the new version has better model support
- The `AISdkClient` + proxy pattern in `src/browser/providers/stagehand-local.ts` must be preserved until Stagehand natively supports `claude-sonnet-4-6`

**`@ai-sdk/anthropic` version:**
- Must stay at `@1.x`. The `@3.x` package (AI SDK spec v2) is incompatible with Stagehand's internal `ai@4.x`

**Gmail 2FA polling is slow on first poll:**
- First IMAP search fetches all matching UIDs — can take 2-3 minutes if there are many old emails
- `checkedUids` tracking prevents re-fetching on subsequent polls

---

## Files to read first in next session

1. `PRD.md` — merged product + engineering doc
2. `ARCHITECTURE.md` — system architecture
3. `src/extract/index.ts` — main orchestrator (was spike.ts)
4. `src/extract/labs.ts` / `visits.ts` / `messages.ts` — section extractors
5. `src/auth.ts` — login + 2FA logic
