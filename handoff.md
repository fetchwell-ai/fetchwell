# Handoff — Phase 1: Refactor + Stabilize

**Date:** 2026-04-13  
**For:** Next Claude Code session

---

## What was accomplished in this session

Phase 0 is complete and validated end-to-end against UCSF MyChart:

- ✅ Login with Gmail auto-2FA (no manual intervention)
- ✅ Session persistence (12h TTL, skips login on re-run)
- ✅ Labs: 36 HTML documents extracted (including imaging reports, MRI/CT/ECG narrative)
- ✅ Visits: 12 HTML + JSON documents
- ✅ Medications: medications.html (6 active medications)
- ✅ Messages: 13/28 HTML threads (fails at thread ~14 on network timeout — fix committed, not yet validated)
- ✅ `output/index.html` browsable local index
- ✅ `pnpm chat` interactive Claude session (loads all records, ~29K tokens, streaming Q&A)
- ✅ `ensureLoggedIn()` session recovery before each section (validated catching 3 mid-run expiries)
- ✅ `navigateWithRetry()` + per-item skip logic committed (not yet validated)

---

## What to do next (Phase 1 priority order)

### 1. Code review with /simplify

Run `/simplify` on `spike/src/` to get a code quality review. Apply reasonable suggestions. The codebase is a ~900-line monolith (`spike.ts`) that grew organically — some cleanup and decomposition is warranted before the refactor.

Key areas to look at:
- `spike.ts` is too long — should be split into extraction modules
- Gmail IMAP polling could be cleaner
- The `navigateWithRetry` and `itemAlreadySaved` helpers (just added) are good patterns to keep
- `chat.ts` is relatively clean (~150 lines)

### 2. Refactor project structure (spike/ → root)

The "spike" has become the real product. Remove the spike/ indirection:

**Target layout:**
```
browser-agent-team/
├── src/
│   ├── extract/
│   │   ├── index.ts          # Main extraction pipeline (was spike.ts)
│   │   ├── labs.ts           # extractLabsDocs()
│   │   ├── visits.ts         # extractVisits()
│   │   ├── medications.ts    # extractMedications()
│   │   └── messages.ts       # extractMessages()
│   ├── chat.ts               # Interactive Claude chat (unchanged)
│   ├── 2fa-relay.ts          # Standalone 2FA helper (unchanged)
│   ├── schemas.ts            # Zod schemas (unchanged)
│   ├── session.ts            # Session persistence helpers
│   ├── auth.ts               # Login + 2FA + ensureLoggedIn
│   └── browser/              # BrowserProvider (unchanged)
├── package.json              # (was spike/package.json)
├── tsconfig.json             # (was spike/tsconfig.json)
├── .env.example
├── output/                   # gitignored
└── [docs]
```

**Steps:**
1. Move `spike/src/` → `src/`
2. Move `spike/package.json`, `tsconfig.json` → root
3. Update all import paths
4. Update `pnpm spike` → `pnpm extract` in package.json scripts
5. Verify `pnpm extract` and `pnpm chat` still work
6. Delete `spike/` directory

### 3. Validate messages fix

The messages network-timeout fix (`navigateWithRetry` + per-thread resume) was committed but never validated end-to-end. After the refactor, run a full `pnpm extract` with an existing session to verify all 28 message threads are saved.

### 4. Zip packaging (P1.3)

Add `pnpm package` (or make it automatic at the end of `pnpm extract`) that creates:
```
mychart-2026-04-13.zip
├── metadata.json    # timestamp, record counts, any errors
├── labs/
├── visits/
├── medications/
└── messages/
```

---

## Known issues / gotchas

**Messages network timeout:**
- The `navigate(listUrl)` call after visiting each thread sometimes times out with `net::ERR_TIMED_OUT`
- Fix committed: `navigateWithRetry()` wraps navigate with one automatic retry; `itemAlreadySaved()` lets partial runs resume
- Not yet validated — needs a full messages run to confirm

**Gmail 2FA polling is slow on first poll:**
- The INBOX can have many old "verification" or "MyChart" emails from prior sessions
- First IMAP search fetches all matching UIDs, which can take 2-3 minutes if there are 30+ matching emails
- `checkedUids` tracking prevents re-fetching on subsequent polls, so only the first poll is slow
- Possible improvement: add a `since` date filter that's more coarse (e.g., last 24h) to limit initial result set

**Stagehand model whitelist:**
- Do NOT update `@browserbasehq/stagehand` without checking if the new version has better model support
- The `AISdkClient` + proxy pattern must be preserved until Stagehand natively supports `claude-sonnet-4-6`

**`@ai-sdk/anthropic` version:**
- Must stay at `@1.x`. The `@3.x` package (AI SDK spec v2) is incompatible with Stagehand's internal `ai@4.x`

---

## Files to read first in next session

1. `PRD.md` — merged product + engineering doc (requirements, phases, stack, env vars)
2. `ARCHITECTURE.md` — system architecture and BrowserProvider abstraction detail
3. `spike/src/spike.ts` — main extraction pipeline (read before refactoring)
4. `spike/src/chat.ts` — chat interface
5. `spike/src/browser/interface.ts` — BrowserProvider interface
