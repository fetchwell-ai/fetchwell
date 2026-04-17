# ADR-001: PDF-only output format

**Date:** 2026-04-14
**Status:** Accepted

## Context

The original spike captured health records as HTML, JSON, and ZIP archives. Two problems emerged:
1. **Scroll truncation** — HTML screenshots captured only the visible viewport, missing content below the fold.
2. **Async content missing** — AJAX-loaded content (imaging reports, lab values rendered client-side) was absent from captures taken before the page finished loading.

Alternatives considered:
- HTML snapshot + scroll stitching — complex, brittle, still misses async content
- JSON extraction via DOM scraping — requires per-page selectors, breaks on portal updates
- ZIP archive of HTML + assets — large, hard to consume downstream

## Decision

Use Playwright's `page.pdf()` for all record captures, called after `waitForLoadState("networkidle")`. No HTML, JSON, or ZIP output.

## Consequences

- Full page height is captured regardless of scroll position — `page.pdf()` renders the entire document.
- Async-loaded content (imaging reports, etc.) is present because networkidle waits for all XHR/fetch to complete.
- Output is four merged PDFs (`labs.pdf`, `visits.pdf`, `medications.pdf`, `messages.pdf`) — uploadable directly to Claude.ai.
- No structured data extraction — content is in PDF text layers, not machine-readable fields.
