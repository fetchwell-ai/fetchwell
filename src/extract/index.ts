/**
 * MyChart Agent — Extraction Pipeline
 *
 * Logs into Epic MyChart, extracts health records as PDFs, and
 * builds a browsable local index.
 *
 * Usage:
 *   pnpm extract                      # single provider (or picker if multiple)
 *   pnpm extract --provider ucsf      # run against a specific provider
 *   pnpm extract --all                # run against all configured providers
 *   PROBE=1 pnpm extract --provider ucsf   # probe mode for a specific provider
 *
 * Session persistence:
 *   After a successful login the browser cookies are saved to output/session.json.
 *   On subsequent runs the saved session is restored so login + 2FA are skipped.
 *   Delete output/session.json to force a fresh login.
 *
 * Force re-extraction of any section:
 *   FORCE_LABS=1 pnpm extract
 *   FORCE_VISITS=1 pnpm extract
 *   FORCE_MEDS=1 pnpm extract
 *   FORCE_MSGS=1 pnpm extract
 */

import dotenv from "dotenv";
dotenv.config({ override: true });

import * as fs from "node:fs";
import * as path from "node:path";
import { createBrowserProvider } from "../browser/index.js";
import { loadSavedSession, saveSession } from "../session.js";
import { isAuthPage, GMAIL_USER, prompt, getAuthModule } from "../auth.js";
import { loadProviders, findProvider, type ProviderConfig } from "../config.js";
import {
  getOutputDir,
  buildIndex,
  readNavNotes,
  getLastExtractedDate,
  setLastExtractedDate,
  type IncrementalSection,
} from "./helpers.js";
import { loadNavMap } from "../discover/nav-map.js";
import { extractLabsDocs, probeLabsDocs } from "./labs.js";
import { extractVisits, probeVisits } from "./visits.js";
import { extractMedications, probeMedications } from "./medications.js";
import { extractMessages, probeMessages } from "./messages.js";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  providerFlag: string | null; // --provider <id>
  allFlag: boolean;            // --all
  incremental: boolean;        // --incremental
}

function parseCliArgs(): CliArgs {
  const args = process.argv.slice(2);
  let providerFlag: string | null = null;
  let allFlag = false;
  let incremental = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--provider" && i + 1 < args.length) {
      providerFlag = args[i + 1];
      i++; // skip the value
    } else if (args[i] === "--all") {
      allFlag = true;
    } else if (args[i] === "--incremental") {
      incremental = true;
    }
  }

  if (providerFlag && allFlag) {
    console.error("Cannot use both --provider and --all.");
    process.exit(1);
  }

  return { providerFlag, allFlag, incremental };
}

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

/**
 * Determine which providers to run against based on CLI flags.
 *
 * - --provider <id> -> single provider
 * - --all -> all providers
 * - no flag + 1 provider -> that provider
 * - no flag + multiple providers -> interactive picker
 */
async function selectProviders(
  allProviders: ProviderConfig[],
  cli: CliArgs,
): Promise<ProviderConfig[]> {
  if (cli.providerFlag) {
    const match = findProvider(allProviders, cli.providerFlag);
    if (!match) {
      console.error(`Unknown provider: "${cli.providerFlag}"`);
      console.error("Available providers:");
      for (const p of allProviders) {
        console.error(`   ${p.id} — ${p.name}`);
      }
      process.exit(1);
    }
    return [match];
  }

  if (cli.allFlag) {
    return allProviders;
  }

  // No flag
  if (allProviders.length === 1) {
    return [allProviders[0]];
  }

  // Multiple providers — interactive picker
  console.log("Multiple providers configured. Select one:");
  console.log();
  for (let i = 0; i < allProviders.length; i++) {
    console.log(`   ${i + 1}) ${allProviders[i].name} (${allProviders[i].id})`);
  }
  console.log();

  const answer = await prompt(`Enter number (1-${allProviders.length}): `);
  const idx = parseInt(answer, 10) - 1;

  if (isNaN(idx) || idx < 0 || idx >= allProviders.length) {
    console.error("Invalid selection.");
    process.exit(1);
  }

  return [allProviders[idx]];
}

// ---------------------------------------------------------------------------
// Env validation
// ---------------------------------------------------------------------------
const providerType = process.env.BROWSER_PROVIDER ?? "stagehand-local";

// ---------------------------------------------------------------------------
// Probe mode (per provider)
// ---------------------------------------------------------------------------
/**
 * Lightweight navigation smoke test. Navigates to each section, calls
 * observe() to find items, logs count + first 5 titles, saves a screenshot
 * to output/probe/{section}.png. Does NOT produce any PDF output.
 *
 * Activate with: PROBE=1 pnpm extract
 */
async function probeProvider(provider: ProviderConfig) {
  const MYCHART_URL = provider.url;
  const providerCredentials = provider.username || provider.password
    ? { username: provider.username, password: provider.password }
    : undefined;
  const authModule = getAuthModule(provider.auth, provider.id);
  const authConfig = { url: MYCHART_URL, credentials: providerCredentials, providerId: provider.id };

  console.log("=".repeat(60));
  console.log("  MyChart Agent — Probe Mode");
  console.log(`  Provider: ${provider.name} (${provider.id})`);
  console.log(`  Mode: ${providerType}`);
  console.log("  (navigation smoke test — no PDFs will be written)");
  console.log("=".repeat(60));
  console.log();

  const outputDir = getOutputDir(provider.id);
  const probeDir = path.join(outputDir, "probe");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(probeDir, { recursive: true });

  const savedSession = loadSavedSession(provider.id);
  if (savedSession) {
    console.log(`   Found saved session from ${savedSession.savedAt} — will skip login.`);
    console.log();
  }

  console.log("Step 1: Creating browser session...");
  const browser = await createBrowserProvider();
  console.log("Browser session created!");

  const debugUrl = await browser.getDebugUrl();
  if (debugUrl) {
    console.log();
    console.log("+---------------------------------------------------------+");
    console.log("|  DEBUG URL — open this in your browser:                  |");
    console.log(`|  ${debugUrl}`);
    console.log("+---------------------------------------------------------+");
  }
  console.log();

  let failed = false;

  try {
    console.log(`Step 2: Navigating to ${MYCHART_URL}...`);
    await browser.navigate(MYCHART_URL);
    console.log("Page loaded.");
    console.log();

    // Login or restore session
    if (savedSession && browser.loadSession) {
      console.log("Step 3: Restoring saved session...");
      await browser.loadSession(savedSession);
      // Navigate to the saved home URL (e.g. /UCSFMyChart/Home/) — NOT the login URL.
      // Navigating to the login URL while already authenticated triggers ?action=logout.
      const verifyUrl = savedSession.homeUrl ?? MYCHART_URL;
      await browser.navigate(verifyUrl);
      await new Promise((r) => setTimeout(r, 2000));

      if (!isAuthPage(await browser.url())) {
        console.log("   Session restored — skipping login and 2FA.");
        console.log();
      } else {
        console.log("   Session expired or invalid. Logging in fresh...");
        await browser.navigate(MYCHART_URL);
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

    const navNotes = readNavNotes(outputDir);

    console.log("Step 4: Probing all sections...");
    console.log();

    await probeLabsDocs(browser, MYCHART_URL, probeDir, navNotes, providerCredentials, provider.id);
    console.log();

    await probeVisits(browser, MYCHART_URL, probeDir, navNotes, providerCredentials, provider.id);
    console.log();

    await probeMedications(browser, MYCHART_URL, probeDir, providerCredentials, provider.id);
    console.log();

    await probeMessages(browser, MYCHART_URL, probeDir, navNotes, providerCredentials, provider.id);
    console.log();

    console.log("=".repeat(60));
    console.log("  PROBE COMPLETE");
    console.log("=".repeat(60));
    console.log();
    console.log(`  Screenshots saved to output/${provider.id}/probe/`);
    console.log(`  [ok] output/${provider.id}/probe/labs.png`);
    console.log(`  [ok] output/${provider.id}/probe/visits.png`);
    console.log(`  [ok] output/${provider.id}/probe/medications.png`);
    console.log(`  [ok] output/${provider.id}/probe/messages.png`);
    console.log();
    console.log("  No PDFs were written. Run pnpm extract for full extraction.");
    console.log();
  } catch (err) {
    failed = true;
    console.error();
    console.error("Probe failed with error:");
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

// ---------------------------------------------------------------------------
// Main extraction (per provider)
// ---------------------------------------------------------------------------
async function extractProvider(provider: ProviderConfig, incremental = false) {
  const MYCHART_URL = provider.url;
  const providerCredentials = provider.username || provider.password
    ? { username: provider.username, password: provider.password }
    : undefined;
  const authModule = getAuthModule(provider.auth, provider.id);
  const authConfig = { url: MYCHART_URL, credentials: providerCredentials, providerId: provider.id };

  console.log("=".repeat(60));
  console.log("  MyChart Agent — Record Extraction");
  console.log(`  Provider: ${provider.name} (${provider.id})`);
  console.log(`  Mode: ${providerType}`);
  if (incremental) {
    console.log("  Incremental: ON (skipping items already extracted)");
  }
  if (GMAIL_USER) {
    console.log(`  2FA: auto via Gmail (${GMAIL_USER})`);
  } else {
    console.log("  2FA: manual (set GMAIL_USER + GMAIL_APP_PASSWORD to automate)");
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
  const browser = await createBrowserProvider();
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
    console.log(`Step 2: Navigating to ${MYCHART_URL}...`);
    await browser.navigate(MYCHART_URL);
    console.log("Page loaded.");
    console.log();

    // Step 3: Login or restore session
    if (savedSession && browser.loadSession) {
      console.log("Step 3: Restoring saved session...");
      await browser.loadSession(savedSession);
      // Navigate to the saved home URL (e.g. /UCSFMyChart/Home/) — NOT the login URL.
      // Navigating to the login URL while already authenticated triggers ?action=logout.
      const verifyUrl = savedSession.homeUrl ?? MYCHART_URL;
      await browser.navigate(verifyUrl);
      await new Promise((r) => setTimeout(r, 2000));

      if (!isAuthPage(await browser.url())) {
        console.log("   Session restored — skipping login and 2FA.");
        console.log();
      } else {
        console.log("   Session expired or invalid. Logging in fresh...");
        console.log();
        console.log("Step 3: Login");
        await browser.navigate(MYCHART_URL);
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
      console.log("   Your credentials are entered locally and sent directly to MyChart.");
      console.log("   They are NOT stored or logged anywhere.");
      console.log();
      await authModule.login(browser, authConfig, debugUrl);
      if (browser.saveSession) {
        const session = await browser.saveSession();
        session.homeUrl = await browser.url();
        saveSession(session, provider.id);
        console.log(`   Session saved to output/${provider.id}/session.json (login + 2FA skipped next run).`);
      }
    }
    console.log();

    const navNotes = readNavNotes(outputDir);

    if (incremental) {
      // Log the last-extracted timestamps so the user can see what the cutoff is
      const sections: IncrementalSection[] = ["labs", "visits", "medications", "messages"];
      console.log("   Incremental cutoffs (items on/before these dates will be skipped):");
      for (const sec of sections) {
        const cutoff = getLastExtractedDate(outputDir, sec);
        console.log(`     ${sec.padEnd(12)}: ${cutoff?.toISOString() ?? "none (full run)"}`);
      }
      console.log();
    }

    const labsCutoff = incremental ? getLastExtractedDate(outputDir, "labs") : null;
    await extractLabsDocs(browser, MYCHART_URL, navNotes, providerCredentials, outputDir, provider.id, labsCutoff);
    setLastExtractedDate(outputDir, "labs");
    console.log();

    const visitsCutoff = incremental ? getLastExtractedDate(outputDir, "visits") : null;
    await extractVisits(browser, MYCHART_URL, navNotes, providerCredentials, outputDir, provider.id, visitsCutoff);
    setLastExtractedDate(outputDir, "visits");
    console.log();

    await extractMedications(browser, MYCHART_URL, providerCredentials, outputDir, provider.id);
    setLastExtractedDate(outputDir, "medications");
    console.log();

    const msgsCutoff = incremental ? getLastExtractedDate(outputDir, "messages") : null;
    await extractMessages(browser, MYCHART_URL, navNotes, providerCredentials, outputDir, provider.id, msgsCutoff);
    setLastExtractedDate(outputDir, "messages");
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
  } catch (err) {
    failed = true;
    console.error();
    console.error("Extraction failed with error:");
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

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function run() {
  // Validate ANTHROPIC_API_KEY early (before provider selection)
  if (providerType !== "local" && !process.env.ANTHROPIC_API_KEY) {
    console.error("Missing required env var: ANTHROPIC_API_KEY");
    process.exit(1);
  }

  const cli = parseCliArgs();
  const allProviders = loadProviders();
  const selectedProviders = await selectProviders(allProviders, cli);

  const isProbe = process.env.PROBE === "1";

  for (const provider of selectedProviders) {
    if (selectedProviders.length > 1) {
      console.log();
      console.log("#".repeat(60));
      console.log(`#  Provider: ${provider.name} (${provider.id})`);
      console.log("#".repeat(60));
      console.log();
    }
    // Warn if no nav-map exists for this provider
    if (!loadNavMap(provider.id)) {
      console.log(`Warning: No nav-map found for ${provider.id}. Run 'pnpm discover --provider ${provider.id}' first for better navigation.`);
      console.log();
    }

    if (isProbe) {
      await probeProvider(provider);
    } else {
      await extractProvider(provider, cli.incremental);
    }
  }
}

run().catch((err) => {
  console.error();
  console.error("Unexpected error:");
  console.error(err);
  process.exit(1);
});
