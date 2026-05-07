/**
 * Extraction Runner — Programmatic Entry Point
 *
 * Exports `extractProvider` as a pure function that throws on error
 * rather than calling `process.exit()`. Used by src/electron-runner.ts
 * (spawned as a subprocess by the Electron pipeline bridge).
 */

import * as fs from "node:fs";
import { createBrowserProvider } from "../browser/index.js";
import { loadSavedSession, saveSession, clearSession } from "../session.js";
import { isAuthPage, checkAuthenticatedElement, getAuthModule } from "../auth.js";
import { type ProviderConfig } from "../config.js";
import {
  getOutputDir,
  buildIndex,
  readNavNotes,
  getLastExtractedDate,
  setLastExtractedDate,
  type IncrementalSection,
} from "./helpers.js";
import { loadNavMap } from "../discover/nav-map.js";
import { extractLabsDocs } from "./labs.js";
import { extractVisits } from "./visits.js";
import { extractMedications } from "./medications.js";
import { extractMessages } from "./messages.js";

/**
 * Run the full extraction pipeline for a single provider.
 * Throws on failure (does not call process.exit).
 */
export async function extractProvider(provider: ProviderConfig, incremental = false): Promise<void> {
  const providerType = process.env.BROWSER_PROVIDER ?? "stagehand-local";
  const portalUrl = provider.url;
  const providerCredentials = provider.username || provider.password
    ? { username: provider.username, password: provider.password }
    : undefined;
  const authModule = getAuthModule(provider.auth, provider.id);
  const authConfig = { url: portalUrl, credentials: providerCredentials, providerId: provider.id };

  console.log("=".repeat(60));
  console.log("  Health Record Fetcher — Record Extraction");
  console.log(`  Provider: ${provider.name} (${provider.id})`);
  console.log(`  Mode: ${providerType}`);
  if (incremental) {
    console.log("  Incremental: ON (skipping items already extracted)");
  }
  console.log("=".repeat(60));
  console.log();

  const outputDir = getOutputDir(provider.id);
  const savedSession = loadSavedSession(provider.id);
  if (savedSession) {
    console.log(`   Found saved session from ${savedSession.savedAt} — will skip login.`);
    console.log(`   (Delete output/${provider.id}/session.json to force a fresh login.)`);
    console.log();
  }

  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`Step 1: Creating ${providerType} browser session...`);
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

  try {
    console.log(`Step 2: Navigating to ${portalUrl}...`);
    await browser.navigate(portalUrl);
    console.log("Page loaded.");
    console.log();

    // Step 3: Login or restore session
    if (savedSession && browser.loadSession) {
      console.log("Step 3: Restoring saved session...");
      await browser.loadSession(savedSession);
      const verifyUrl = savedSession.homeUrl ?? portalUrl;
      await browser.navigate(verifyUrl);
      await new Promise((r) => setTimeout(r, 2000));

      const currentUrl = await browser.url();
      const onAuthPage = isAuthPage(currentUrl);
      const selectors = provider.authenticatedSelectors ?? [];
      const hasAuthElement = onAuthPage || selectors.length === 0 ? false : await checkAuthenticatedElement(browser, selectors);

      if (!onAuthPage && (selectors.length === 0 || hasAuthElement)) {
        console.log("   Session restored — skipping login and 2FA.");
        console.log();
      } else {
        if (onAuthPage) {
          console.log(`   Session expired — redirected to auth page: ${currentUrl}`);
        } else {
          console.log(`   Session validation failed — no authenticated elements found at ${currentUrl}`);
        }
        console.log("   Logging in fresh...");
        clearSession(provider.id);
        console.log();
        console.log("Step 3: Login");
        await browser.navigate(portalUrl);
        await new Promise((r) => setTimeout(r, 2000));
        await authModule.login(browser, authConfig, debugUrl);
        if (browser.saveSession) {
          const session = await browser.saveSession();
          session.homeUrl = await browser.url();
          saveSession(session, provider.id);
          console.log(`   Session saved to output/${provider.id}/session.json.`);
        }
      }
    } else {
      console.log("Step 3: Login");
      await authModule.login(browser, authConfig, debugUrl);
      if (browser.saveSession) {
        const session = await browser.saveSession();
        session.homeUrl = await browser.url();
        saveSession(session, provider.id);
        console.log(`   Session saved to output/${provider.id}/session.json (login + 2FA skipped next run).`);
      }
    }
    console.log();

    // Warn if no nav-map exists
    if (!loadNavMap(provider.id)) {
      console.log(`Warning: No nav-map found for ${provider.id}. Run discovery first for better navigation.`);
      console.log();
    }

    const navNotes = readNavNotes(outputDir);

    if (incremental) {
      const sections: IncrementalSection[] = ["labs", "visits", "medications", "messages"];
      console.log("   Incremental cutoffs (items on/before these dates will be skipped):");
      for (const sec of sections) {
        const cutoff = getLastExtractedDate(outputDir, sec);
        console.log(`     ${sec.padEnd(12)}: ${cutoff?.toISOString() ?? "none (full run)"}`);
      }
      console.log();
    }

    const labsCutoff = incremental ? getLastExtractedDate(outputDir, "labs") : null;
    const labsCount = await extractLabsDocs(browser, portalUrl, navNotes, providerCredentials, outputDir, provider.id, labsCutoff, incremental, provider.authenticatedSelectors);
    if (labsCount > 0) setLastExtractedDate(outputDir, "labs");
    console.log();

    const visitsCutoff = incremental ? getLastExtractedDate(outputDir, "visits") : null;
    const visitsCount = await extractVisits(browser, portalUrl, navNotes, providerCredentials, outputDir, provider.id, visitsCutoff, incremental, provider.authenticatedSelectors);
    if (visitsCount > 0) setLastExtractedDate(outputDir, "visits");
    console.log();

    const medsCount = await extractMedications(browser, portalUrl, providerCredentials, outputDir, provider.id, incremental, provider.authenticatedSelectors);
    if (medsCount > 0) setLastExtractedDate(outputDir, "medications");
    console.log();

    const msgsCutoff = incremental ? getLastExtractedDate(outputDir, "messages") : null;
    const msgsCount = await extractMessages(browser, portalUrl, navNotes, providerCredentials, outputDir, provider.id, msgsCutoff, incremental, provider.authenticatedSelectors);
    if (msgsCount > 0) setLastExtractedDate(outputDir, "messages");
    console.log();

    buildIndex(outputDir, provider.id);

    console.log("=".repeat(60));
    console.log("  EXTRACTION COMPLETE");
    console.log("=".repeat(60));
    console.log();
    console.log(`  [ok] output/${provider.id}/labs-${provider.id}.pdf`);
    console.log(`  [ok] output/${provider.id}/visits-${provider.id}.pdf`);
    console.log(`  [ok] output/${provider.id}/medications-${provider.id}.pdf`);
    console.log(`  [ok] output/${provider.id}/messages-${provider.id}.pdf`);
    console.log(`  [ok] output/${provider.id}/index.html  (upload PDFs to Claude.ai)`);
    console.log();
  } finally {
    console.log("Cleaning up session...");
    await browser.close();
    console.log("Done.");
  }
}
