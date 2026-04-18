# MyChart Agent — Plan

**Last updated:** 2026-04-17 (session 2)

**Task tracking:** This project uses beads. Run `bd ready` for next tasks. Active epic: `browser-agent-team-7et` (Phase 2 — Browserbase). Design docs: `docs/plans/`.

---

## Overall Plan

| Phase | Beads Epic | Goal |
|---|---|---|
| **Phase 0** | *(complete)* | Core extraction: authenticate (incl. 2FA), extract labs, visits, medications, messages as PDFs |
| **Phase 1** | *(complete)* | Refactor + stabilize: proper `src/` structure, PDF-only output, reliability fixes |
| **Phase 2** | `browser-agent-team-7et` | Cloud browser: run extraction via Browserbase, no local browser required |
| **Phase 1.4** | `browser-agent-team-i20` | Proper CLI entry point — deferred |
| **Phase 3** | `browser-agent-team-iv7` | Multi-user web UI, guided setup, secure per-user credentials |

---

## Current Status — 2026-04-17 (session 2)

**Phase 2 code complete (3/4 tasks).** Implemented all three Browserbase provider fixes via epic-executor with code review:
- `7et.1` ✅ — AISdkClient + Proxy model setup (replaces stale `modelName` approach)
- `7et.2` ✅ — `pdf()` method implemented
- `7et.3` ✅ — `saveSession()` / `loadSession()` implemented

**`7et.4` blocked** — end-to-end validation requires `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` in `.env`.

**Workflow improvements:** Updated `start-session` skill to offer explicit epic-executor / plan-to-epic / manual choice. Updated `code-reviewer` agent to explicitly report when tests or linters are not found (rather than silently skipping).

## Current Status — 2026-04-17 (session 1)

**Phase 1 complete.** All four record sections extract and merge correctly via local Stagehand. Migrated to beads for task tracking.

---

## Known Issues / Blockers

- **`7et.4` blocked on credentials** — Browserbase end-to-end validation requires `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`. Add to `.env` to unblock. Also review Browserbase's data handling policy before use (infrastructure-level access to rendered health record pages).
- Session re-login per section is expected behavior: `ensureLoggedIn()` re-authenticates when the server-side session expires mid-run. Gmail auto-2FA handles re-logins transparently after the first login in a run.
