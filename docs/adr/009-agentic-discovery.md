# ADR-009: Agentic portal discovery replaces imperative keyword matching

**Status:** Accepted  
**Date:** 2026-05-10  
**Deciders:** Chad Allen

## Context

The discovery engine navigates health portals to find four record sections (labs, visits, medications, messages) and records the navigation path in a `nav-map.json` file.

The original implementation was a 600-line imperative pipeline:

1. `observe()` all nav elements on the dashboard
2. Click each one, `observe()` the resulting page to get a prose description
3. Run `matchSection()` — keyword scoring with word-boundary regex against ~50 hardcoded keywords
4. If keywords matched, record the section. If not, try sub-nav items.
5. If still missing sections, run a targeted fallback loop with hardcoded link labels.

This broke when three prompt-tuning commits changed the keyword lists and observe prompts. The LLM would describe a page differently than expected (e.g., "medical test findings" instead of "test results"), and `matchSection()` returned null. The fundamental problem: we were asking the LLM to understand a page, then second-guessing its understanding with regex.

## Decision

Replace the imperative keyword-matching engine with an agentic loop:

1. For each section, call `browser.act("Find and navigate to the test results page...")` with generous aliases.
2. Verify with `browser.extract()` using a Zod enum schema — the LLM returns `{ isCorrectPage: boolean }` directly.
3. Record the URL and act() instruction in the nav-map.

The nav-map becomes a **cache/hint**, not a hard contract:

- Extraction uses a 3-tier fallback: try cached URL → replay nav-map steps → fresh agentic search.
- If any tier succeeds, the nav-map is updated with the new URL for next time.
- No separate "mapping" step is exposed to the user — extraction discovers on-the-fly.

## Consequences

**Positive:**
- 189 lines down from 600. No keyword lists, skip patterns, reject indicators, or sub-nav drilling.
- Resilient to portal changes — the LLM navigates semantically, not via brittle keyword matching.
- Simpler UX — users click "Fetch records" directly, no mapping step.
- Self-healing — stale nav-maps are automatically corrected during extraction.

**Negative:**
- More LLM calls per discovery run (act + extract per section vs. batch observe + keyword match).
- Non-deterministic — the LLM may take different navigation paths on repeated runs.
- Harder to unit test — the old `matchSection()` was pure and testable; the new flow requires browser mocks.

**Risks:**
- If the agentic approach fails on a portal, fallback is to revert `src/discover/index.ts` to commit `98f8bd3` (the last verified imperative version). This is documented in beads memory `discovery-fallback-commit-98f8bd3`.

## Alternatives Considered

1. **Fix keyword matching with `browser.extract()` + Zod enum.** Would replace `matchSection()` with direct LLM classification but keep the observe-all-then-click-each loop. Rejected: still over-engineered for what `act()` does natively.

2. **Use page text / URL heuristics.** Check URL paths and `<h1>` text before calling the LLM. Rejected: page text includes nav elements (false positives on every page), and portals use inconsistent terminology across institutions.
