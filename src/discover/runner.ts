/**
 * Discovery Runner — Programmatic Entry Point
 *
 * Exports `discoverProviderById` as a pure function that throws on error
 * rather than calling `process.exit()`. Used by src/electron-runner.ts
 * (spawned as a subprocess by the Electron pipeline bridge).
 */

import * as fs from "node:fs";
import { createBrowserProvider } from "../browser/index.js";
import { loadSavedSession } from "../session.js";
import { getAuthModule } from "../auth.js";
import { type ProviderConfig } from "../config.js";
import { getOutputDir } from "../extract/helpers.js";
import { discoverPortal } from "./index.js";
import { loadNavMap, saveNavMap } from "./nav-map.js";
import { detectLoginFormType } from "../auth/detect-login-form.js";
import { type StructuredProgressEvent } from "../progress-events.js";
import { loginOrRestoreSession } from "../auth/login-session.js";

/** Optional callback for emitting structured progress events to the Electron parent. */
export type ProgressEmitter = (event: StructuredProgressEvent) => void;

/**
 * Run portal discovery for a single provider.
 * Throws on failure (does not call process.exit).
 *
 * @param provider      - Provider configuration
 * @param basePath      - Optional base output directory (Electron download folder).
 *                        Defaults to OUTPUT_BASE (CLI mode) when omitted.
 * @param emitProgress  - Optional callback for structured progress events (Electron mode only).
 */
export async function discoverProviderById(
  provider: ProviderConfig,
  basePath?: string,
  emitProgress?: ProgressEmitter,
): Promise<void> {
  const portalUrl = provider.url;
  const authModule = getAuthModule(provider.auth, provider.id);

  // Helper: emit if we have a progress emitter (Electron mode)
  const emit = (event: StructuredProgressEvent) => {
    if (emitProgress) emitProgress(event);
  };

  console.log("=".repeat(60));
  console.log("  FetchWell — Portal Discovery");
  console.log(`  Provider: ${provider.name} (${provider.id})`);
  console.log("  Mode: stagehand-local");
  console.log("=".repeat(60));
  console.log();

  const outputDir = getOutputDir(provider.id, basePath);
  fs.mkdirSync(outputDir, { recursive: true });

  const savedSession = loadSavedSession(provider.id, basePath);
  if (savedSession) {
    console.log(`   Found saved session from ${savedSession.savedAt} — will skip login.`);
    console.log();
  }

  emit({ type: 'status-message', phase: 'login', message: 'Opening your portal...' });
  console.log("Step 1: Creating browser session...");
  const browser = await createBrowserProvider(undefined, process.env.ANTHROPIC_API_KEY);
  console.log("Browser session created!");

  const debugUrl = await browser.getDebugUrl();
  if (debugUrl) {
    console.log();
    console.log("+---------------------------------------------------------+");
    console.log("|  DEBUG URL — open this in your browser:                  |");
    console.log(`|  ${debugUrl}`);
    console.log("+---------------------------------------------------------+");
  } else if (process.env.HEADLESS !== 'true') {
    console.log("   A browser window should have opened on your screen.");
  }
  console.log();

  // Check whether a nav-map already exists for this provider.
  // If it does, this is a re-run and we should skip login form detection
  // (the user may have overridden the setting manually).
  const existingNavMap = loadNavMap(provider.id, basePath);
  const isFirstDiscovery = existingNavMap === null;

  try {
    // ── Phase: login ──────────────────────────────────────────────────────
    emit({ type: 'phase-change', phase: 'login', status: 'running', message: 'Logging in...' });
    emit({ type: 'status-message', phase: 'login', message: 'Navigating to sign-in page...' });

    console.log(`Step 2: Navigating to ${portalUrl}...`);
    await browser.navigate(portalUrl);
    console.log("Page loaded.");
    console.log();

    // Detect login form type on the first discovery run only.
    // The browser is on the login page at this point (portalUrl).
    let detectedLoginForm: "two-step" | "single-page" | undefined;
    if (isFirstDiscovery) {
      console.log("Step 2a: Detecting login form type...");
      await new Promise((r) => setTimeout(r, 2000));
      detectedLoginForm = await detectLoginFormType(browser);
      console.log(`   Login form type detected: ${detectedLoginForm}`);
      console.log();
    } else {
      console.log("   Skipping login form detection (nav-map already exists).");
      console.log();
    }

    const homeUrl = await loginOrRestoreSession(browser, {
      portalUrl,
      providerId: provider.id,
      basePath,
      authModule,
      emitProgress,
    });
    console.log();

    emit({ type: 'phase-change', phase: 'login', status: 'complete', message: 'Logged in' });

    // ── Phase: navigate ───────────────────────────────────────────────────
    emit({ type: 'phase-change', phase: 'navigate', status: 'running', message: 'Discovering portal structure...' });
    emit({ type: 'status-message', phase: 'navigate', message: 'Mapping your portal...' });

    console.log("Step 4: Discovering portal structure...");
    console.log();
    const navMap = await discoverPortal(browser, provider.id, homeUrl, emitProgress);

    // Persist the detected login form type in the nav-map (first discovery only).
    if (detectedLoginForm !== undefined) {
      navMap.detectedLoginForm = detectedLoginForm;
      saveNavMap(navMap, provider.id, basePath);
      console.log(`   Detected login form type "${detectedLoginForm}" stored in nav-map.`);
    }

    emit({ type: 'status-message', phase: 'navigate', message: 'Building navigation map...' });
    emit({ type: 'phase-change', phase: 'navigate', status: 'complete', message: `Discovered ${Object.keys(navMap.sections).length}/4 sections` });
    emit({ type: 'status-message', phase: 'navigate', message: 'Portal mapped successfully' });

    console.log();
    console.log("=".repeat(60));
    console.log("  DISCOVERY COMPLETE");
    console.log("=".repeat(60));
    console.log();
    console.log(`  Nav map saved to output/${provider.id}/nav-map.json`);
    if (navMap.detectedLoginForm) {
      console.log(`  Detected login form: ${navMap.detectedLoginForm}`);
    }
    console.log(`  Found ${Object.keys(navMap.sections).length}/4 sections`);
    for (const [key, sec] of Object.entries(navMap.sections)) {
      console.log(`    ${key}: ${sec.steps.length} navigation step(s)`);
    }
    console.log();
  } finally {
    console.log("Cleaning up session...");
    await browser.close();
    console.log("Done.");
  }
}
