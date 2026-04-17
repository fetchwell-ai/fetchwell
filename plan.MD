# MyChart Agent — Plan

**Last updated:** 2026-04-17

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

## Current Status — 2026-04-17

**Phase 1 complete.** All four record sections extract and merge correctly via local Stagehand. Migrated to beads for task tracking.

**Phase 2 next.** `src/browser/providers/stagehand-browserbase.ts` is stubbed but needs three fixes (model setup, pdf(), session methods) tracked in `browser-agent-team-7et`.

---

## Known Issues / Blockers

None blocking Phase 2.

- Session re-login per section is expected behavior: `ensureLoggedIn()` re-authenticates when the server-side session expires mid-run. Gmail auto-2FA handles re-logins transparently after the first login in a run.
