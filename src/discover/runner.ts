/**
 * Discovery Runner — Programmatic Entry Point
 *
 * Exports `discoverProviderById` as a pure function that throws on error
 * rather than calling `process.exit()`. Used by src/electron-runner.ts
 * (spawned as a subprocess by the Electron pipeline bridge).
 */

import * as fs from "node:fs";
import { createBrowserProvider } from "../browser/index.js";
import { loadSavedSession, saveSession } from "../session.js";
import { isAuthPage, getAuthModule } from "../auth.js";
import { type ProviderConfig } from "../config.js";
import { getOutputDir } from "../extract/helpers.js";
import { discoverPortal } from "./index.js";
import { loadNavMap, saveNavMap } from "./nav-map.js";
import { detectLoginFormType } from "../auth/detect-login-form.js";

/**
 * Run portal discovery for a single provider.
 * Throws on failure (does not call process.exit).
 *
 * @param provider  - Provider configuration
 * @param basePath  - Optional base output directory (Electron download folder).
 *                    Defaults to OUTPUT_BASE (CLI mode) when omitted.
 */
export async function discoverProviderById(provider: ProviderConfig, basePath?: string): Promise<void> {
  const providerType = process.env.BROWSER_PROVIDER ?? "stagehand-local";
  const portalUrl = provider.url;
  const providerCredentials = provider.username || provider.password
    ? { username: provider.username, password: provider.password }
    : undefined;
  const authModule = getAuthModule(provider.auth, provider.id);
  const authConfig = { url: portalUrl, credentials: providerCredentials, providerId: provider.id };

  console.log("=".repeat(60));
  console.log("  FetchWell — Portal Discovery");
  console.log(`  Provider: ${provider.name} (${provider.id})`);
  console.log(`  Mode: ${providerType}`);
  console.log("=".repeat(60));
  console.log();

  const outputDir = getOutputDir(provider.id, basePath);
  fs.mkdirSync(outputDir, { recursive: true });

  const savedSession = loadSavedSession(provider.id, basePath);
  if (savedSession) {
    console.log(`   Found saved session from ${savedSession.savedAt} — will skip login.`);
    console.log();
  }

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
  } else {
    console.log("   A browser window should have opened on your screen.");
  }
  console.log();

  // Check whether a nav-map already exists for this provider.
  // If it does, this is a re-run and we should skip login form detection
  // (the user may have overridden the setting manually).
  const existingNavMap = loadNavMap(provider.id, basePath);
  const isFirstDiscovery = existingNavMap === null;

  try {
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

    let homeUrl: string;

    if (savedSession && browser.loadSession) {
      console.log("Step 3: Restoring saved session...");
      await browser.loadSession(savedSession);
      const verifyUrl = savedSession.homeUrl ?? portalUrl;
      await browser.navigate(verifyUrl);
      await new Promise((r) => setTimeout(r, 2000));

      if (!isAuthPage(await browser.url())) {
        console.log("   Session restored — skipping login and 2FA.");
        homeUrl = await browser.url();
      } else {
        console.log("   Session expired or invalid. Logging in fresh...");
        await browser.navigate(portalUrl);
        await new Promise((r) => setTimeout(r, 2000));
        await authModule.login(browser, authConfig, debugUrl);
        homeUrl = await browser.url();
        if (browser.saveSession) {
          const session = await browser.saveSession();
          session.homeUrl = homeUrl;
          saveSession(session, provider.id, basePath);
          console.log(`   Session saved to output/${provider.id}/session.json.`);
        }
      }
    } else {
      console.log("Step 3: Login");
      await authModule.login(browser, authConfig, debugUrl);
      homeUrl = await browser.url();
      if (browser.saveSession) {
        const session = await browser.saveSession();
        session.homeUrl = homeUrl;
        saveSession(session, provider.id, basePath);
        console.log(`   Session saved to output/${provider.id}/session.json (login + 2FA skipped next run).`);
      }
    }
    console.log();

    console.log("Step 4: Discovering portal structure...");
    console.log();
    const navMap = await discoverPortal(browser, provider.id, homeUrl);

    // Persist the detected login form type in the nav-map (first discovery only).
    if (detectedLoginForm !== undefined) {
      navMap.detectedLoginForm = detectedLoginForm;
      saveNavMap(navMap, provider.id, basePath);
      console.log(`   Detected login form type "${detectedLoginForm}" stored in nav-map.`);
    }

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
