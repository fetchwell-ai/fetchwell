# Fetchwell — Desktop app UI kit

A high-fidelity recreation of the Fetchwell Electron app surfaces using the new design system (sage + paper + ochre, Newsreader/Geist).

This is a **proposal**, not a port of the existing renderer — the team's directive was to treat current colors/layout/tone as not set in stone. Component _structure_ mirrors `src/renderer/` (Sidebar + Portal list + Add portal + Welcome + 2FA modal + Progress panel) so the redesign is a drop-in target for the existing code.

Open [`index.html`](index.html) for the click-through prototype.

## Components covered

- `Sidebar.jsx` — 240px window sidebar with portals + settings
- `PortalList.jsx` — main screen, list of portal cards
- `PortalCard.jsx` — name, URL, status badges, Map/Fetch/Remove
- `AddPortal.jsx` — form for adding a portal
- `Welcome.jsx` — first-run wizard
- `TwoFactorModal.jsx` — 2FA prompt
- `ProgressPanel.jsx` — phase indicator + log stream
- `Button.jsx`, `Input.jsx`, `Label.jsx`, `Badge.jsx`, `Alert.jsx`, `Card.jsx` — primitives

## What's intentionally not real

- All data is fake. No backend wiring.
- "Map" and "Fetch" buttons run a simulated 6-step animation, not a real browser agent.
- 2FA modal accepts any 6-digit code.
- Dark mode is not wired up here (the system-level vars in `colors_and_type.css` are ready, though).
