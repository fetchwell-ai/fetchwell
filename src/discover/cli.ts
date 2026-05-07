/**
 * Portal Structure Discovery — CLI Entry Point
 *
 * Logs into a health portal and discovers its navigation structure,
 * saving a nav-map.json that the extraction pipeline can use.
 *
 * Usage:
 *   pnpm discover --provider stanford
 */

import dotenv from "dotenv";
dotenv.config({ override: true });

import * as fs from "node:fs";
import { createBrowserProvider } from "../browser/index.js";
import { loadSavedSession, saveSession } from "../session.js";
import { isAuthPage, prompt, getAuthModule } from "../auth.js";
import { loadProviders, findProvider } from "../config.js";
import { getOutputDir } from "../extract/helpers.js";
import { discoverPortal } from "./index.js";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseCliArgs(): { providerId: string } {
  const args = process.argv.slice(2);
  let providerId: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--provider" && i + 1 < args.length) {
      providerId = args[i + 1];
      i++;
    }
  }

  if (!providerId) {
    console.error("Usage: pnpm discover --provider <id>");
    console.error("");
    console.error("The --provider flag is required.");
    process.exit(1);
  }

  return { providerId };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const providerType = process.env.BROWSER_PROVIDER ?? "stagehand-local";

async function run() {
  // Validate ANTHROPIC_API_KEY early
  if (providerType !== "local" && !process.env.ANTHROPIC_API_KEY) {
    console.error("Missing required env var: ANTHROPIC_API_KEY");
    process.exit(1);
  }

  const cli = parseCliArgs();
  const allProviders = loadProviders();
  const provider = findProvider(allProviders, cli.providerId);

  if (!provider) {
    console.error(`Unknown provider: "${cli.providerId}"`);
    console.error("Available providers:");
    for (const p of allProviders) {
      console.error(`   ${p.id} — ${p.name}`);
    }
    process.exit(1);
  }

  const portalUrl = provider.url;
  const providerCredentials = provider.username || provider.password
    ? { username: provider.username, password: provider.password }
    : undefined;
  const authModule = getAuthModule(provider.auth, provider.id);
  const authConfig = { url: portalUrl, credentials: providerCredentials, providerId: provider.id };

  console.log("=".repeat(60));
  console.log("  Health Record Fetcher — Portal Discovery");
  console.log(`  Provider: ${provider.name} (${provider.id})`);
  console.log(`  Mode: ${providerType}`);
  console.log("=".repeat(60));
  console.log();

  const outputDir = getOutputDir(provider.id);
  fs.mkdirSync(outputDir, { recursive: true });

  const savedSession = loadSavedSession(provider.id);
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

  let failed = false;

  try {
    console.log(`Step 2: Navigating to ${portalUrl}...`);
    await browser.navigate(portalUrl);
    console.log("Page loaded.");
    console.log();

    // Step 3: Login or restore session
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
          saveSession(session, provider.id);
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
        saveSession(session, provider.id);
        console.log(`   Session saved to output/${provider.id}/session.json (login + 2FA skipped next run).`);
      }
    }
    console.log();

    // Step 4: Run discovery
    console.log("Step 4: Discovering portal structure...");
    console.log();
    const navMap = await discoverPortal(browser, provider.id, homeUrl);

    console.log();
    console.log("=".repeat(60));
    console.log("  DISCOVERY COMPLETE");
    console.log("=".repeat(60));
    console.log();
    console.log(`  Nav map saved to output/${provider.id}/nav-map.json`);
    console.log(`  Found ${Object.keys(navMap.sections).length}/4 sections`);
    for (const [key, sec] of Object.entries(navMap.sections)) {
      console.log(`    ${key}: ${sec.steps.length} navigation step(s)`);
    }
    console.log();
    console.log("  Run 'pnpm extract --provider " + provider.id + "' to extract records.");
    console.log();
  } catch (err) {
    failed = true;
    console.error();
    console.error("Discovery failed with error:");
    console.error(err);
    console.error();
    console.error("Browser is being kept open for inspection.");
    console.error("Press Enter to close it.");
    await prompt("");
  } finally {
    console.log("Cleaning up session...");
    await browser.close();
    console.log("Done.");
    if (failed) process.exit(1);
  }
}

run().catch((err) => {
  console.error();
  console.error("Unexpected error:");
  console.error(err);
  process.exit(1);
});
