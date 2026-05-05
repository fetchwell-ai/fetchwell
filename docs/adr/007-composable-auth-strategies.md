# ADR-007: Composable auth strategies via two-axis strategy registries

**Date:** 2026-05-05
**Status:** Accepted

## Context

Phase 3 introduced multi-provider support. Each provider has its own login flow and 2FA handling. The original auth code was monolithic — a single `auth/mychart.ts` that hardcoded the Stanford login form and tried Gmail auto-fetch with a manual fallback for 2FA.

Adding a second provider would have required duplicating this file and diverging the two copies over time. Three axes of variation were identified:

1. **Login form shape** — some portals use a two-step flow (username → password on separate pages); others use a single-page form.
2. **2FA method** — some providers use email OTP (auto-fetchable via Gmail IMAP); others require manual entry; some have no 2FA at all.
3. **Portal type** — MyChart, Epic, etc. (not yet a source of variation, but anticipated).

Alternatives considered:
- Per-provider auth module files (`auth/stanford.ts`, `auth/ucsf.ts`) — combinatorial explosion; shared logic would drift.
- Single file with `switch` statements on provider config — becomes a maintenance burden as providers grow.
- Full plugin system with dynamic import — over-engineered for the current scale.

## Decision

Auth is composed from two independent strategy registries along two axes:

- **`loginForm`** — `"two-step"` | `"single-page"` (registry in `src/auth/strategies/login-form.ts`)
- **`twoFactor`** — `"none"` | `"email"` | `"manual"` (registry in `src/auth/strategies/two-factor.ts`)

`getAuthModule(authSettings, providerId)` in `src/auth/index.ts` looks up the appropriate handler from each registry and composes them into an `AuthModule`. Adding a new login form variant or 2FA method requires only adding a function to the relevant registry — no new files, no new conditionals in the orchestration layer.

Each provider declares its strategies in `providers.json`:

```json
"auth": {
  "loginForm": "two-step",
  "twoFactor": "email"
}
```

## Consequences

- New providers need only declare their strategy combination in `providers.json` — no code changes if the combination already exists in the registries.
- New strategy variants are isolated to one registry file; they don't touch login orchestration or 2FA orchestration.
- The `AuthModule` interface (`src/auth/interface.ts`) remains stable — callers never see the composition internals.
- Strategy functions must accept a `BrowserProvider` and optional credentials/provider ID — functions with different signatures can't be added without adapting the registry contract.
