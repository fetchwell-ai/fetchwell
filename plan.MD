# MyChart Agent — Plan

**Last updated:** 2026-04-18 (session 3)

**Task tracking:** This project uses beads. Run `bd ready` for next tasks. Active epic: `browser-agent-team-7et` (Phase 2 — Browserbase, blocked on credentials). Design docs: `docs/plans/`.

---

## Overall Plan

| Phase | Beads Epic | Goal |
|---|---|---|
| **Phase 0** | *(complete)* | Core extraction: authenticate (incl. 2FA), extract labs, visits, medications, messages as PDFs |
| **Phase 1** | *(complete)* | Refactor + stabilize: proper `src/` structure, PDF-only output, reliability fixes |
| **Phase 2** | `browser-agent-team-7et` | Cloud browser: run extraction via Browserbase, no local browser required |
| **Phase 2.5** | `browser-agent-team-8ep` *(complete)* | Navigation debugging: probe mode, depth logging, nav-notes correction file |
| **Phase 1.4** | `browser-agent-team-i20` | Proper CLI entry point — deferred |
| **Phase 3** | `browser-agent-team-iv7` | Multi-user web UI, guided setup, secure per-user credentials |

---

## Current Status — 2026-04-18 (session 3)

**Phase 2.5 complete (3/3 tasks).** Implemented the full navigation debugging suite via epic-executor with code review:
- `8ep.3` ✅ — `output/nav-notes.md` correction file: write agent instructions, auto-prepended to every `observe()` call
- `8ep.2` ✅ — Real-time depth logging: `[probe] section | url | page title` logged before every `observe()`
- `8ep.1` ✅ — `PROBE=1 pnpm extract`: fast smoke test — navigate + observe + screenshot, no PDFs

**7et.4 still blocked** on Browserbase credentials.

## Current Status — 2026-04-17 (session 2)

**Phase 2 code complete (3/4 tasks).** Implemented all three Browserbase provider fixes:
- `7et.1` ✅ — AISdkClient + Proxy model setup
- `7et.2` ✅ — `pdf()` method implemented
- `7et.3` ✅ — `saveSession()` / `loadSession()` implemented

**Workflow improvements:** Updated `start-session`, `code-reviewer`, global ESLint/SwiftLint linting configs, language-aware reviewer agents.

---

## Known Issues / Blockers

- **`7et.4` blocked on credentials** — Browserbase end-to-end validation requires `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`. Add to `.env` to unblock. Also review Browserbase's data handling policy before use (infrastructure-level access to rendered health record pages).
- Session re-login per section is expected behavior: `ensureLoggedIn()` re-authenticates when the server-side session expires mid-run. Gmail auto-2FA handles re-logins transparently after the first login in a run.
