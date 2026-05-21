# ADR-012: Disable asar and use afterPack npm install for Electron packaging

**Date:** 2026-05-21
**Status:** Accepted

## Context

The packaged Electron app forks `electron-runner.cjs` as a child process via `child_process.fork()`. Two problems prevented this from working with asar enabled: (1) `fork()` cannot execute files inside an asar archive — it needs a real filesystem path, and (2) even with `asarUnpack`, the unpacked runner can't resolve `require()` calls back into the asar's node_modules. Additionally, electron-builder's dependency walker for pnpm misses transitive dependencies — only 119 of 452 packages were included in the asar, causing `MODULE_NOT_FOUND` errors at runtime.

## Decision

Set `asar: false` in electron-builder.yml and use an `afterPack` hook (`scripts/after-pack.cjs`) that runs `npm install --omit=dev` inside the packaged app directory. This replaces electron-builder's broken pnpm dependency walker with npm's reliable flat resolution. The runner is built as CJS format (`--format=cjs --packages=external`) with `--define:import.meta.dirname=__dirname` to handle ESM→CJS API differences at build time.

## Alternatives Considered

- **`asarUnpack` + `NODE_PATH`**: Unpacked the runner and pointed `NODE_PATH` at `app.asar/node_modules`. CJS `require()` worked via Electron's asar patching, but pnpm's missing transitive deps in the asar meant packages like `whatwg-url` were still absent.
- **`shamefully-hoist` / `node-linker=hoisted`** in `.npmrc`: Attempted to flatten pnpm's node_modules so electron-builder could find all packages. Even with flat hoisting, electron-builder's walker still missed dependencies.
- **Full bundling** (remove `--packages=external`): Bundled all JS deps into the runner via esbuild. Failed because playwright-core uses runtime `require.resolve()` for relative paths like `../../../package.json`, and `dotenv` uses dynamic `require('fs')` which doesn't work in ESM format.
- **ESM format with banner shims**: Added `createRequire`, `__dirname`, `__filename` via `--banner:js`. Fixed the immediate errors but playwright's internal path resolution still broke when bundled.

## Consequences

- The DMG is slightly larger (~10MB more node_modules on disk vs compressed in asar).
- Cold startup is marginally slower (reading individual files vs one archive). Negligible for this app.
- Source code is visible in the app bundle (acceptable — the project is source-available).
- `playwright` and `@browserbasehq/stagehand` must be pinned to exact versions in `package.json` to prevent the afterPack `npm install` from resolving breaking versions.
- npm warnings about pnpm-specific config options appear during the afterPack install (harmless noise).
