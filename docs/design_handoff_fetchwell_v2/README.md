# Handoff: Fetchwell v2 redesign + new features

## What this is

A redesign **and** a feature update for the Fetchwell macOS app (Electron + React renderer). The previous renderer was built in Claude Code as a thin shadcn/ui + Tailwind shell on Apple-blue. This handoff replaces the visual language **and** introduces new screens that didn't exist before — most importantly a per-portal detail view that surfaces extraction results, history, schedule, and credentials.

Treat this as both a design-system migration *and* a small set of new product requirements.

## About the files in this folder

The HTML / JSX files here are **design references**, not production code. They were authored as a self-contained prototype using React via inline Babel + a hand-rolled CSS kit. **Do not copy them verbatim** into the renderer. Instead:

- Recreate the screens in the existing Electron renderer (`src/renderer/`) using the project's established stack: React 18, Tailwind v4, shadcn/ui primitives, Framer Motion, `lucide-react`.
- Replace the existing Tailwind / shadcn theme tokens with the new tokens in `00_design_system/colors_and_type.css`. Wire them through the Tailwind v4 `@theme` block so utility classes (`bg-primary`, `text-fg-muted`, etc.) resolve to the new values.
- Keep using shadcn `<Button>`, `<Card>`, `<Badge>`, `<Input>`, `<Alert>` — restyle them, don't replace them.
- Replace the existing 'Apple blue + system font' theme entirely. Do not leave both palettes coexisting.

## Fidelity

**High.** Colors, type, spacing, radii, shadows, motion are all final. Recreate pixel-for-pixel where the layout is shown; defer to the design system tokens for anything not explicitly drawn.

## What's in this bundle

```
00_design_system/
  README.md                       The full system: voice, color, type, spacing,
                                  radii, shadows, motion, layout rules, iconography.
                                  Read this first.
  colors_and_type.css             All design tokens as CSS custom properties.
                                  Includes opt-in dark mode (.dark class) and
                                  webfont @import for Newsreader / Geist /
                                  Recursive Mono Casual.
  assets/                         Logo + marks (SVG).

01_app_mockup/
  index.html                      Open this to see the redesigned app running.
  app.jsx                         Top-level App + PortalsPane + PortalDetailPane
                                  + SettingsPane. Read this for the screen
                                  structure & state model.
  sidebar.jsx                     Left nav: portals + collapsible Settings section.
  portal-card.jsx                 Portal card used in the list view.
  quickstart.jsx                  "Get started" checklist.
  icons.jsx                       Inline Lucide SVGs (the renderer should use
                                  lucide-react with the same names).
  kit.css                         Component CSS. **Reference only** — don't copy;
                                  use it as a spec for restyling shadcn.
```

## Screens to implement

### 1. Portal list (default view)

**Purpose:** Overview of all configured portals + onboarding nudge for new users.

**Layout:**
- 240px fixed left sidebar (sage-tinted paper, never collapses).
- Main pane: 40px gutters, 980px max-width.
- Header row: H1 "Your portals" + lede + right-aligned "Add portal" primary button.
- Below header: **QuickStart card** (see below) when not dismissed.
- Below QuickStart: vertical stack of `PortalCard`s with 16px gap.

**QuickStart card** (`quickstart.jsx`):
- Surface: `--fw-surface` (warm cream), 1px border, `--fw-radius-lg`, `--fw-shadow-1`.
- Left edge accent: 3px gradient bar, sage→ochre.
- Eyebrow "GET STARTED" in sage-700 caps + uppercase tracking.
- H3 in Newsreader 500: "Three quick steps to your first records."
- Progress counter (`2 / 4`) right-aligned in mono.
- Dismiss `×` icon button.
- 4 step rows: pill check (filled moss when done, outlined when not) + label + optional meta + arrow chevron. Current step has sage-100 background.
- Auto-collapses to a one-line "You're all set up" success bar when all done.

**PortalCard** (`portal-card.jsx`):
- Card: `--fw-surface`, 1px `--fw-border`, `--fw-radius-md`, 22/24px padding, `--fw-shadow-1`. Hover: translateY(-1px) + `--fw-shadow-2`.
- Layout: header row (name H2 + URL in mono / gear icon button) → badges row → optional **inline guidance** strip → optional meta strip (only when fetched) → footer with action buttons.
- Behavior changes by `state`: `new` | `mapped` | `fetched` | `error`. See `portal-card.jsx` for exact badge + guidance + button mapping.
- Inline guidance is a left-bordered tinted strip:
  - `new` → sage tint (info), compass icon, "Next: tell us where your records live."
  - `mapped` → moss tint (success), check icon, "You're ready for the first extraction."
  - `error` → crimson tint, alert icon, credentials guidance.
  - `fetched` → no guidance.
- Clicking the card body opens **Portal detail** (new screen).

### 2. Portal detail (NEW — does not exist in v1)

**Route:** triggered by clicking a portal in the sidebar OR clicking a portal card.

**Purpose:** Single source of truth for one portal — what's been fetched, when, where it lives on disk, and how to manage it.

**Sections (top to bottom):**

1. **Breadcrumb:** "← All portals" ghost button.
2. **Header:** H1 portal name, meta line (URL · Last fetched · Mapped on), action buttons right-aligned. Action buttons swap by state: `new` → "Map portal" primary; `mapped` → "Fetch records" primary; `fetched` → "Re-map" secondary + "Fetch again" primary.
3. **Records breakdown** (only when state=fetched): 4-up grid of stat tiles — Lab results, Visit notes, Medications, Messages. Each tile: tinted icon disc + large count number (Newsreader) + label. Tile tints: moss / sage / ochre / ink.
4. **Folder row** (fetched only): folder icon + monospace path + "Reveal in Finder" ghost button. Wire this to Electron `shell.showItemInFolder`.
5. **Empty state** (state=new): info card with compass disc + "Map this portal first" + body copy + Start mapping primary.
6. **Ready state** (state=mapped): success card with check icon + "Mapped and ready to fetch."
7. **History** (when any history exists): vertical list. Each row: status dot + event label (with `+N new` suffix when applicable) + timestamp + "View log" ghost button. Events: First extraction / Incremental fetch / Mapping completed.
8. **Schedule:** card with "Auto-fetch every week" + next-run timestamp + iOS-style toggle.
9. **Credentials:** card with username + password fields (read masked) + "Update credentials" secondary button. Add the line "Stored in macOS Keychain — never sent to Anthropic." as helper text.
10. **Danger zone:** crimson H2 + card with "Remove this portal" + danger button.

### 3. Sidebar (revised)

- Top: 52px draggable title bar with logo mark + "fetchwell" wordmark in Newsreader 500.
- Section: "PORTALS" caption → portal rows (status dot + name) → "+ Add portal" muted row.
- Section: collapsible "SETTINGS" with chevron → sub-rows: Appearance, Anthropic API key, Storage location, Privacy & data, About Fetchwell.
- Footer: `v0.1.0` + `local-only` badge in mono.
- Active row: solid sage-700 background, paper text. **The previous duplicate top-right Settings button is gone — only one entry point now (the sidebar).**

### 4. Settings (revised)

Selecting a settings sub-row replaces the main pane (same chrome, no modal). Pages:

- **Appearance** (NEW): segmented control — System / Light / Dark with sun/moon/monitor icons. Persist to `localStorage` and toggle `.dark` class on `<html>`. Honor `prefers-color-scheme` when "System" is selected.
- **Anthropic API key:** input with "Validated" help text + Save / Get a key buttons.
- **Storage location:** path input + Choose… button (Electron `dialog.showOpenDialog`).
- **Privacy & data:** body text only.
- **About Fetchwell:** version line in mono + tagline.

## State model

```ts
type PortalState = 'new' | 'mapped' | 'fetched' | 'error';

interface Portal {
  id: string;                     // slug, used as folder name
  name: string;
  url: string;
  state: PortalState;
  mappedAt?: string;              // human date "May 7"
  lastFetched?: string;
  recordCounts?: { labs, visits, medications, messages, total };
}
```

App-level state:
- `activePortalId: string | null` — null = list view, otherwise detail view.
- `activeSettingsKey: 'appearance'|'key'|'storage'|'privacy'|'about'|null`.
- `quickstartDismissed: boolean` — persist to localStorage.
- `theme: 'system'|'light'|'dark'` — persist to localStorage.

QuickStart steps are **derived** from real state, not stored:
1. API key set → from settings.
2. Any portal added → `portals.length > 0`.
3. Any portal fetched → mapping is implicit.
4. First extraction run → any portal in `fetched` state.

## Design tokens — quick reference

Pull authoritative values from `00_design_system/colors_and_type.css`. Highlights:

- Primary: `--fw-sage-700` `#1F4D3E` (replaces `#0071e3`).
- Paper: `--fw-paper` `#F4EFE6`. Surface: `--fw-surface` `#FCFAF6`.
- Ink: `--fw-ink-900` `#161714` (not pure black).
- Success: `--fw-moss-600` `#4A7C59`. Warning: `--fw-ochre-600` `#B47834`. Danger: `--fw-crimson-600` `#9E2A2B`.
- Fonts: Newsreader (display), Geist (sans), Recursive Mono Casual (mono — `MONO 1, CASL 1` axes).
- Radii: 4 / 6 / 10 / 14. Shadows: warm-tinted (`rgba(40,30,15,…)`) not black.
- Motion: 120 / 180 / 280ms; cubic-bezier(.2,.7,.2,1) for ease-out. Respect `prefers-reduced-motion`.
- Dark mode: opt-in via `.dark` class. Already wired in the codebase via Tailwind v4 `@variant dark`.

## Voice & copy

The full voice guide is in `00_design_system/README.md` ("Content fundamentals"). Two rules to internalize:
- Sentence case for everything except proper nouns.
- "Last fetched May 7" not "Last extracted: May 7, 2026". "Login didn't go through. Check your username and password and try again." not "An error occurred."

## Iconography

Use `lucide-react` (already a dependency). All icons referenced by name in `icons.jsx` map 1:1 to Lucide names. 1.5px stroke, `currentColor`. No emoji. No Unicode glyph icons.

## What changed from v1, summarized

| Area              | v1                                         | v2                                                                       |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| Palette           | Apple blue `#0071e3` + cool grays          | Forest sage `#1F4D3E` + warm cream `#F4EFE6` + ochre + ink                |
| Type              | System fonts                               | Newsreader / Geist / Recursive Mono Casual                                |
| Settings entry    | Bottom-left **and** top-right (duplicate)  | Sidebar only, as a collapsible section with sub-rows                      |
| New users         | Empty page with no guidance                | "Get started" checklist card derived from real state                      |
| Portal card       | Name + URL + 3 buttons                     | Adds inline state-aware guidance + meta strip when fetched                |
| Portal detail     | Did not exist                              | New: records breakdown, folder row, history, schedule, credentials, danger zone |
| Dark mode         | OS-driven via media query                  | Explicit class-based + Appearance setting (System / Light / Dark)         |

## Suggested implementation order

1. Wire the new tokens into Tailwind v4 (`@theme` in `src/renderer/styles.css`) and replace the Apple-blue references throughout. Verify the existing screens still render — they should, just in the new palette.
2. Restyle shadcn `<Button>`, `<Card>`, `<Badge>`, `<Input>`, `<Alert>` to match.
3. Add the new fonts (Newsreader / Geist / Recursive Mono Casual via Google Fonts or self-host).
4. Update Sidebar — remove the duplicate top-right Settings, add the collapsible Settings section, restyle.
5. Build PortalCard v2 (badges + inline guidance + meta strip).
6. Build QuickStart card.
7. Build PortalDetail screen — biggest single piece of new work.
8. Build Appearance setting + class-based dark mode toggle.
9. Pass over voice/copy with the strings from the system README.

## Open questions

- The Records breakdown tiles assume the extraction returns counts per category. The PRD has this — confirm the agent already emits these or add them.
- "Reveal in Finder" + "View log" buttons in the detail view — wire to existing IPC if present, otherwise stub.
- Schedule (auto-fetch weekly) is shown as a UI affordance but may not be implemented yet. Treat as a **product question** before building.
