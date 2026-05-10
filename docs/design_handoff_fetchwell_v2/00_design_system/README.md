# Fetchwell Design System

> A warm, considered design system for a desktop app that handles sensitive health data.

## What is Fetchwell

Fetchwell is a **macOS desktop application** (Electron, Slack-style) that helps patients take control of their health data. It runs an AI-powered browser agent locally on the user's machine to log in to patient portals (Epic MyChart, Stanford, UCSF, OneMedical, etc.), navigate them, and download medical records as PDFs to a local folder. The user provides their own Anthropic API key — no server, no telemetry, no data leaves the device except LLM calls.

The product is built around two flows per portal:

- **Map** — the agent crawls the portal once and builds a `nav-map.json` of where Labs, Visits, Medications, and Messages live.
- **Extract** — using the nav-map, the agent downloads each section as merged PDFs.

When a portal asks for a 2FA code, the app pauses extraction and prompts the user inline. Credentials are encrypted with Electron `safeStorage` (macOS Keychain).

### Target user

Someone who wants their health records as PDFs but isn't comfortable with git, Node, or terminals. They follow setup instructions, paste an API key, enter their portal credentials.

### Core principle: transparency

When there's a tradeoff between simplicity and transparency, choose transparency. The user should understand what the app is doing, what data the AI agent sees, and where things are stored. This shapes copy and UI: explicit phase indicators, plain-language errors, visible logs, no magic.

## Why this design system exists

The current renderer was built quickly in Claude Code and lands somewhere between generic shadcn/ui and stock macOS — Apple-blue primary, system fonts, Tailwind defaults. Fine, but **cold and forgettable** for an app that touches your most personal data. Patients don't want their health records to feel like a developer tool.

This design system proposes a new direction: **warm, considered, slightly editorial.** A modern apothecary's records office — deep forest greens, warm cream paper, quiet serifs alongside a clean grotesque, generous whitespace, plain-spoken copy. Professional and serious because the data is serious; warm because the user is a person, not a record.

## Sources

- **Codebase:** `chadallen/fetchwell` on GitHub (private). The renderer (`src/renderer/`) was imported into this project for reference.
- **Spec:** [`PRD.md`](https://github.com/chadallen/fetchwell/blob/main/PRD.md) and [`CLAUDE.md`](https://github.com/chadallen/fetchwell/blob/main/CLAUDE.md) in the repo describe behavior and architecture in detail.
- No Figma file. No marketing site. No prior brand assets — Fetchwell is pre-launch.

If you don't have repo access, ask the user. Don't guess at unseen files.

## Index

- [`README.md`](README.md) — this file
- [`colors_and_type.css`](colors_and_type.css) — CSS custom properties for color, type, spacing, radii, shadow, motion
- [`SKILL.md`](SKILL.md) — Claude Skill metadata so this folder works as a portable Claude Code skill
- [`fonts/`](fonts/) — webfont CSS imports (Google Fonts: Newsreader, Geist, Recursive Mono Casual)
- [`assets/`](assets/) — logos, marks, icons, sample illustrations
- [`preview/`](preview/) — design-system preview cards (Type, Colors, Spacing, Components, Brand)
- [`ui_kits/desktop_app/`](ui_kits/desktop_app/) — high-fidelity recreation of the Electron app surfaces

## Content fundamentals

Voice should feel like a calm clinician who explains things — not a chatbot, not a marketer. Ground every claim, never overpromise, never apologize loudly.

**Tone**

- Warm. Plain. Specific. Never coy.
- Confident about what the app does and doesn't do.
- Direct about risk and tradeoffs (this is a privacy product).
- Slightly editorial in long copy — sentences with rhythm, not bullets stacked on bullets.

**Person & address**

- **You** for the user. **Fetchwell** for the product. **We** is rare; reserve it for the company in privacy contexts ("We never see your records").
- Avoid `please`. Just say what to do: "Enter the code", not "Please enter the code".
- Avoid `simply`, `just`, `easily`, `seamlessly`. The work isn't simple — it's automated.

**Casing**

- **Sentence case** for everything: titles, buttons, menus. ("Add portal" not "Add Portal".)
- **Title Case** is reserved for proper nouns: portal names ("UCSF Medical Center"), section names from the portal ("Lab Results"), product names ("Anthropic", "Claude").

**Examples — rewrite the cold version into the Fetchwell voice**

| Cold (current)                            | Fetchwell                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| "Welcome"                                 | "Let's get you set up."                                                    |
| "An error occurred."                      | "Login didn't go through. Check your username and password and try again." |
| "Your data never leaves your machine."    | "Your records stay on this Mac. We don't see them, ever."                  |
| "Add Portal"                              | "Add a portal"                                                             |
| "Run Map first to enable extraction."     | "Map this portal once before extracting."                                  |
| "Mapping complete. Found 4/4 sections."   | "Mapped. Found 4 sections: Labs, Visits, Medications, Messages."           |
| "Browser visibility"                      | "Show the browser while it works"                                          |
| "Last extracted: May 7, 2026"             | "Last fetched May 7"                                                       |
| "Please enter the verification code."     | "Enter the code your portal just sent."                                    |

**Numbers, dates, units**

- Dates: `May 7` for current year, `May 7, 2025` for prior years. No `2026-05-07` in user-facing UI; reserve ISO for logs.
- Counts: "4 of 12 labs" not "4/12". Reserve `4/12` for the dense progress strip.
- Sizes: `2.4 MB`, `1 record`, `12 records`. Pluralize.

**Emoji**

- Don't use them in product UI, copy, or marketing. Fetchwell handles medical records — emoji read as flippant.
- Exception: a single sparkle or check glyph is acceptable in changelog/release notes. None in the app itself.

**Iconography in copy**

- Don't sprinkle Unicode symbols (★, ✓, →) inline. Use real icons (see [Iconography](#iconography)) or words.

## Visual foundations

### Color

A warm, archive-room palette. Sage anchors the brand; warm cream and bone replace the cold Apple grays; ink, not black, for text.

| Role                      | Token                  | Hex       | Notes                                                       |
| ------------------------- | ---------------------- | --------- | ----------------------------------------------------------- |
| Primary                   | `--fw-sage-700`        | `#1F4D3E` | Forest sage. Buttons, focus rings, links.                   |
| Primary hover             | `--fw-sage-800`        | `#173B30` | Darker sage on hover.                                       |
| Primary tint              | `--fw-sage-100`        | `#E1ECE6` | Selected rows, badges.                                      |
| Accent                    | `--fw-ochre-600`       | `#B47834` | Warning highlights, "in progress", brand accent.            |
| Accent tint               | `--fw-ochre-100`       | `#F2E6D0` | Background for ochre badges/chips.                          |
| Foreground (ink)          | `--fw-ink-900`         | `#161714` | Primary text. Not pure black.                               |
| Foreground muted          | `--fw-ink-500`         | `#6B655C` | Secondary text.                                             |
| Foreground subtle         | `--fw-ink-400`         | `#8C857B` | Captions, placeholders.                                     |
| Background paper          | `--fw-paper`           | `#F4EFE6` | Window background. Warm cream.                              |
| Surface                   | `--fw-surface`         | `#FCFAF6` | Cards. Slightly warmer white than paper to lift them.       |
| Surface raised            | `--fw-surface-raised`  | `#FFFFFF` | Modals only.                                                |
| Border subtle             | `--fw-border`          | `#E5DFD2` | All cell/card borders.                                      |
| Border strong             | `--fw-border-strong`   | `#C9C0AC` | Inputs, dividers under headings.                            |
| Success                   | `--fw-moss-600`        | `#4A7C59` | "Mapped", "Extracted" badges. Same family as sage.          |
| Warning                   | `--fw-ochre-600`       | `#B47834` | 2FA pending, stale data warnings.                           |
| Destructive               | `--fw-crimson-600`     | `#9E2A2B` | Errors, remove buttons. Earthy red, not neon.               |
| Destructive tint          | `--fw-crimson-100`     | `#F4DAD9` | Background for destructive alerts.                          |

**Dark mode** mirrors the warmth — `#1B1A17` base (warm near-black), `#252320` cards, `#EDE6D7` text, with sage shifted lighter (`#7AB39A`) for contrast.

### Type

Three families. **Newsreader** for display (a warm, contemporary serif with optical sizing). **Geist** for body (clean grotesque, technical without being cold). **Recursive Mono Casual** for IDs, paths, code-adjacent UI — handwritten-feeling monospace, deliberately not a terminal face.

| Role           | Family          | Weight | Size / line-height          | Tracking  |
| -------------- | --------------- | ------ | --------------------------- | --------- |
| Display XL     | Newsreader      | 400    | 56px / 60px                 | -0.02em   |
| Display L      | Newsreader      | 400    | 40px / 44px                 | -0.015em  |
| H1             | Newsreader      | 500    | 28px / 34px                 | -0.01em   |
| H2             | Geist           | 600    | 20px / 26px                 | -0.005em  |
| H3             | Geist           | 600    | 16px / 22px                 | 0         |
| Body           | Geist           | 400    | 14px / 22px                 | 0         |
| Body small     | Geist           | 400    | 13px / 20px                 | 0         |
| Caption        | Geist           | 500    | 11px / 16px, uppercase      | 0.08em    |
| Mono           | Recursive Mono Casual | 400    | 13px / 22px (MONO 1, CASL 1) | 0         |

Display serifs are reserved for **moments**: the welcome screen, empty states, the first line of the privacy disclosure, marketing collateral. Don't use them for buttons, table headers, or running UI.

### Spacing

A 4-pt grid. Names map to multiples; use the names in components, not raw px.

| Token         | Value | Usage                                |
| ------------- | ----- | ------------------------------------ |
| `--fw-sp-1`   | 4px   | Icon-to-text gap                     |
| `--fw-sp-2`   | 8px   | Tight inline gap                     |
| `--fw-sp-3`   | 12px  | Inside chips, between tags           |
| `--fw-sp-4`   | 16px  | Card padding (small)                 |
| `--fw-sp-5`   | 20px  | Form field gap                       |
| `--fw-sp-6`   | 24px  | Card padding (default)               |
| `--fw-sp-8`   | 32px  | Page padding (small)                 |
| `--fw-sp-10`  | 40px  | Page padding                         |
| `--fw-sp-12`  | 48px  | Section break                        |
| `--fw-sp-16`  | 64px  | Hero margin                          |

### Radii

Soft but not pillowy. Inputs are sharper than cards.

| Token              | Value | Usage                              |
| ------------------ | ----- | ---------------------------------- |
| `--fw-radius-xs`   | 4px   | Tags, chips                        |
| `--fw-radius-sm`   | 6px   | Inputs, buttons                    |
| `--fw-radius-md`   | 10px  | Cards                              |
| `--fw-radius-lg`   | 14px  | Modals, large surfaces             |
| `--fw-radius-pill` | 999px | Pills, status dots                 |

### Shadow & elevation

Two layers, both **warm-tinted**. The warmth comes from a `rgba(40,30,15,...)` shadow color rather than pure black — neutral grays + black shadows look cold against cream paper.

| Token            | Value                                                                                      | Usage              |
| ---------------- | ------------------------------------------------------------------------------------------ | ------------------ |
| `--fw-shadow-1`  | `0 1px 2px rgba(40,30,15,0.06), 0 1px 1px rgba(40,30,15,0.04)`                             | Cards at rest      |
| `--fw-shadow-2`  | `0 4px 12px rgba(40,30,15,0.08), 0 1px 3px rgba(40,30,15,0.06)`                            | Hover, dropdowns   |
| `--fw-shadow-3`  | `0 16px 40px rgba(40,30,15,0.18), 0 4px 12px rgba(40,30,15,0.10)`                          | Modals             |

### Borders

- Cards: `1px solid var(--fw-border)`. Borders **and** a soft shadow — the border keeps the surface readable on `--fw-paper` even when shadows render weakly.
- Inputs: `1px solid var(--fw-border-strong)` resting; `1px solid var(--fw-sage-700)` on focus, plus a 3px sage-100 ring.
- Dividers: 1px `var(--fw-border)` under H1/H2 in long content areas; never inside dense lists.

### Motion

Quiet, fast, no bounce. The product handles slow real work (browser automation) — the UI itself shouldn't be theatrical.

| Token                  | Value                       | Usage                          |
| ---------------------- | --------------------------- | ------------------------------ |
| `--fw-dur-fast`        | 120ms                       | Hovers, button color shifts    |
| `--fw-dur-base`        | 180ms                       | Modal & panel enter            |
| `--fw-dur-slow`        | 280ms                       | Page transitions               |
| `--fw-ease-out`        | `cubic-bezier(.2,.7,.2,1)`  | Default ease-out               |
| `--fw-ease-in-out`     | `cubic-bezier(.5,0,.2,1)`   | Page transitions               |

- **Hover:** color or background shift, ~120ms. Buttons may lift `1px` on hover (`translateY(-1px)`) only if also gaining shadow-2.
- **Press:** scale `0.98` + 60ms duration, on primary buttons only. Secondary buttons just darken.
- **Loading:** a 1.4s shimmer on skeleton bars (very low contrast, cream-on-cream). No spinners that spin forever; phase-indicator dots that pulse with the active step (see ProgressPanel in the kit).
- **Reduced motion:** respect `prefers-reduced-motion`. Cross-fade only.

### Backgrounds & texture

- **No gradients** as background fills. Sage-to-emerald, ochre-to-pink, blue-to-purple — all out.
- **Subtle paper grain** is allowed at very low opacity (~3%) on the welcome and marketing surfaces. Skip it inside dense product UI.
- **Full-bleed photography** is allowed for marketing and onboarding hero. Imagery should be warm-toned, slightly desaturated, slightly grainy. No stock-photo "happy doctor with iPad" clichés.

### Layout rules

- Sidebar is **240px**, fixed, doesn't collapse. Lives on the left.
- Title bar is `52px` and is a `WebkitAppRegion: drag` zone (Electron requirement to drag the window from the chrome).
- Content gutters: `40px` on the main pane.
- Form max-width: `560px`. Long-form prose: `640px`. Don't let either fill an ultrawide monitor.
- The 2FA modal is `400px`, centered, over a `rgba(20,15,5,0.55)` scrim.

### Transparency & blur

- The window chrome (sidebar) gets a faint `backdrop-filter: blur(20px)` only when running on macOS with vibrancy (controlled in main process). On non-vibrancy targets it's a flat `--fw-paper-deep` (`#EBE5D7`). No blur inside the content area.

### Imagery

- Warm-toned, slightly desaturated, ~3% grain.
- Subjects: hands, paper records, archive shelves, soft daylight. Not literal stethoscopes. Not stock-photo Caucasian doctors with iPads. Not abstract cyber lock illustrations.
- B&W is welcome for editorial moments (privacy explainer, about page).

## Iconography

- **Icon library:** [Lucide](https://lucide.dev), via CDN: `https://unpkg.com/lucide@latest`. Stroke-based, 1.5px stroke, rounded join — pairs cleanly with the warm palette.
- **Sizing:** 16px in dense UI, 20px in cards, 24px on landing/marketing. Stroke stays 1.5px at all sizes; do **not** scale the stroke up.
- **Color:** icons inherit `currentColor` from their text context. They never carry brand color independently of their label.
- **Codebase status:** the existing renderer used `lucide-react`. We're keeping Lucide. The CSS in `colors_and_type.css` includes a Lucide CDN reference; the desktop UI kit uses inline SVG sprites pulled from Lucide so previews don't depend on the CDN at view time.
- **Emoji:** none. The product handles medical records.
- **Unicode glyphs as icons:** none. Don't use `★`, `✓`, `→` as icon stand-ins. Use Lucide.
- **App logo:** see [`assets/fetchwell-logo.svg`](assets/fetchwell-logo.svg) and [`assets/fetchwell-mark.svg`](assets/fetchwell-mark.svg).

## Substitutions & flags

A small number of choices in this system substitute for things we couldn't find in the source. Treat these as **proposals to confirm with the user**, not decisions:

1. **Color palette** is a fresh proposal. The codebase uses Apple blue (`#0071e3`) on cool grays; we're proposing forest sage on warm paper. **Confirm direction before propagating** to the codebase.
2. **Logo** is a placeholder — a hand-set "fetchwell" wordmark with a small leaf-glyph for the mark. The team has no logo yet.
3. **Voice/tone examples** under "Content fundamentals" are mostly proposals; only the existing copy in the rewrites is real.
4. The codebase has dark mode wired in. The dark palette here is a proposal that aligns with the warm direction, not a port of the existing dark.

## Iteration asks

This system is a strong first cut, **not a finished spec**. The biggest things you can do to make it perfect:

- Confirm the palette direction (sage + paper + ochre) or send a counter — we'll re-anchor everything from there.
- Send a logo or commission one — the placeholder works for previews but is not a brand mark.
- Tell us about marketing surfaces (a website? a launch deck?) so the system covers them too.
