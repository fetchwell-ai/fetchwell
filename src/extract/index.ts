/**
 * Fetchwell — Extraction Pipeline
 *
 * Logs into health portals (e.g. Epic MyChart), extracts health records as PDFs, and
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
 * Force re-extraction of a section in incremental mode:
 *   FORCE_LABS=1 pnpm extract --incremental
 *   FORCE_VISITS=1 pnpm extract --incremental
 *   FORCE_MEDS=1 pnpm extract --incremental
 *   FORCE_MSGS=1 pnpm extract --incremental
 *
 * Note: FORCE_* vars are only needed in --incremental mode. A plain
 * `pnpm extract` always re-extracts all sections regardless of existing PDFs.
 */

import dotenv from "dotenv";
dotenv.config({ override: true });

import * as fs from "node:fs";
import * as path from "node:path";
import { createBrowserProvider } from "../browser/index.js";
import { loadSavedSession } from "../session.js";
import { prompt, getAuthModule } from "../auth.js";
import { loginOrRestoreSession } from "../auth/login-session.js";
import { loadProviders, findProvider, type ProviderConfig } from "../config.js";
import {
  getOutputDir,
  readNavNotes,
} from "./helpers.js";
import { loadNavMap } from "../discover/nav-map.js";
import { probeLabsDocs } from "./labs.js";
import { probeVisits } from "./visits.js";
import { probeMedications } from "./medications.js";
import { probeMessages } from "./messages.js";
import { extractProvider as runnerExtractProvider } from "./runner.js";

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
  const portalUrl = provider.url;
  const providerCredentials = provider.username || provider.password
    ? { username: provider.username, password: provider.password }
    : undefined;
  const authModule = getAuthModule(provider.auth, provider.id);

  console.log("=".repeat(60));
  console.log("  Fetchwell — Probe Mode");
  console.log(`  Provider: ${provider.name} (${provider.id})`);
  console.log("  (navigation smoke test — no PDFs will be written)");
  console.log("=".repeat(60));
  console.log();

  const outputDir = getOutputDir(provider.id);
  const probeDir = path.join(outputDir, "probe");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(probeDir, { recursive: true });

  const savedSession = loadSavedSession(provider.id);
  if (savedSession) {
    console.log(`[session] Found saved session from ${savedSession.savedAt} — will skip login.`);
    console.log();
  }

  console.log("[pipeline] Creating browser session...");
  const browser = await createBrowserProvider(undefined, process.env.ANTHROPIC_API_KEY);
  console.log("[pipeline] Browser session created!");

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
    console.log(`[pipeline] Navigating to ${portalUrl}...`);
    await browser.navigate(portalUrl);
    console.log("[pipeline] Page loaded.");
    console.log();

    // Login or restore session
    // homeUrl = the authenticated dashboard URL (NOT the login URL).
    // Passing portalUrl to probers while authenticated can trigger ?action=logout on MyChart.
    const homeUrl = await loginOrRestoreSession(browser, {
      portalUrl,
      providerId: provider.id,
      authModule,
      credentials: providerCredentials,
      authenticatedSelectors: provider.authenticatedSelectors,
    });
    console.log();

    const navNotes = readNavNotes(outputDir);

    console.log("[probe] Probing all sections...");
    console.log();

    await probeLabsDocs(browser, homeUrl, probeDir, navNotes, providerCredentials, provider.id, provider.authenticatedSelectors);
    console.log();

    await probeVisits(browser, homeUrl, probeDir, navNotes, providerCredentials, provider.id, provider.authenticatedSelectors);
    console.log();

    await probeMedications(browser, homeUrl, probeDir, providerCredentials, provider.id, provider.authenticatedSelectors);
    console.log();

    await probeMessages(browser, homeUrl, probeDir, navNotes, providerCredentials, provider.id, provider.authenticatedSelectors);
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
    console.error("[probe] Probe failed with error:");
    console.error(err);
    console.error();
    console.error("[probe] Browser is being kept open for inspection.");
    console.error("[probe] Press Enter to close it.");
    await prompt("");
  } finally {
    console.log("[pipeline] Cleaning up session...");
    await browser.close();
    console.log("[pipeline] Done.");
    if (failed) process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main extraction (per provider) — thin CLI wrapper around runner.extractProvider
// ---------------------------------------------------------------------------

/**
 * CLI wrapper around runner.extractProvider.
 *
 * Delegates the full extraction pipeline to the shared runner, then:
 *   - On error: prompts the user to press Enter before exiting (only when
 *     stdout is a TTY so that scripted / CI invocations do not hang).
 *   - Calls process.exit(1) on failure.
 */
async function extractProvider(provider: ProviderConfig, incremental = false) {
  try {
    await runnerExtractProvider(provider, incremental);
  } catch (err) {
    console.error();
    console.error("[extract] Extraction failed with error:");
    console.error(err);
    console.error();
    if (process.stdout.isTTY) {
      console.error("[extract] Press Enter to exit.");
      await prompt("");
    }
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function run() {
  // Validate ANTHROPIC_API_KEY early (before provider selection)
  if (!process.env.ANTHROPIC_API_KEY) {
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
      console.log(`[nav] Warning: No nav-map found for ${provider.id}. Run 'pnpm discover --provider ${provider.id}' first for better navigation.`);
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
