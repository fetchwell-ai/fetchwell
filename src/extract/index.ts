/**
 * MyChart Agent — Extraction Pipeline
 *
 * Logs into Epic MyChart, extracts health records as HTML documents, and
 * builds a browsable local index.
 *
 * Usage:
 *   pnpm extract
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
import { isAuthPage, doLogin, GMAIL_USER, prompt } from "../auth.js";
import { OUTPUT_DIR, buildIndex } from "./helpers.js";
import { extractLabsDocs } from "./labs.js";
import { extractVisits } from "./visits.js";
import { extractMedications } from "./medications.js";
import { extractMessages } from "./messages.js";

// ---------------------------------------------------------------------------
// Env validation
// ---------------------------------------------------------------------------
const providerType = process.env.BROWSER_PROVIDER ?? "stagehand-local";

if (!process.env.MYCHART_URL) {
  console.error("Missing required env var: MYCHART_URL");
  console.error("   Copy .env.example to .env and fill in the values.");
  process.exit(1);
}

if (providerType !== "local" && !process.env.ANTHROPIC_API_KEY) {
  console.error("Missing required env var: ANTHROPIC_API_KEY");
  process.exit(1);
}

if (providerType === "browserbase") {
  for (const key of ["BROWSERBASE_API_KEY", "BROWSERBASE_PROJECT_ID"] as const) {
    if (!process.env[key]) {
      console.error(`Missing required env var for browserbase mode: ${key}`);
      process.exit(1);
    }
  }
}

const MYCHART_URL = process.env.MYCHART_URL!;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("=".repeat(60));
  console.log("  MyChart Agent — Record Extraction");
  console.log(`  Mode: ${providerType}`);
  if (GMAIL_USER) {
    console.log(`  2FA: auto via Gmail (${GMAIL_USER})`);
  } else {
    console.log("  2FA: manual (set GMAIL_USER + GMAIL_APP_PASSWORD to automate)");
  }
  console.log("=".repeat(60));
  console.log();

  const savedSession = loadSavedSession();
  if (savedSession) {
    console.log(`   Found saved session from ${savedSession.savedAt} — will skip login.`);
    console.log("   (Delete output/session.json to force a fresh login.)");
    console.log();
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

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
      await browser.navigate(MYCHART_URL.replace(/\/Authentication.*$/, ""));
      await new Promise((r) => setTimeout(r, 2000));

      if (!isAuthPage(await browser.url())) {
        console.log("   Session restored — skipping login and 2FA.");
        console.log();
      } else {
        console.log("   Session expired or invalid. Logging in fresh...");
        await browser.navigate(MYCHART_URL);
        await new Promise((r) => setTimeout(r, 2000));
        console.log();
        console.log("Step 3: Login");
        await doLogin(browser, debugUrl);
        if (browser.saveSession) {
          saveSession(await browser.saveSession());
          console.log("   Session saved to output/session.json.");
        }
      }
    } else {
      console.log("Step 3: Login");
      console.log("   Your credentials are entered locally and sent directly to MyChart.");
      console.log("   They are NOT stored or logged anywhere.");
      console.log();
      await doLogin(browser, debugUrl);
      if (browser.saveSession) {
        saveSession(await browser.saveSession());
        console.log("   Session saved to output/session.json (login + 2FA skipped next run).");
      }
    }
    console.log();

    // Step 6: Labs extraction (one .pdf per panel + merged output/labs.pdf)
    await extractLabsDocs(browser, MYCHART_URL);
    console.log();

    // Step 8: Screenshot
    console.log("Step 8: Saving labs screenshot...");
    const screenshotBase64 = await browser.screenshot();
    fs.writeFileSync(
      path.join(OUTPUT_DIR, "screenshot.png"),
      Buffer.from(screenshotBase64, "base64"),
    );
    console.log(`Screenshot saved to output/screenshot.png`);
    console.log();

    // Steps 9-11: Visits, Medications, Messages
    await extractVisits(browser, MYCHART_URL);
    console.log();

    await extractMedications(browser, MYCHART_URL);
    console.log();

    await extractMessages(browser, MYCHART_URL);
    console.log();

    buildIndex();

    console.log("=".repeat(60));
    console.log("  EXTRACTION COMPLETE");
    console.log("=".repeat(60));
    console.log();
    console.log("  [ok] Labs extracted to output/labs/ (one .pdf per panel) + output/labs.pdf");
    console.log("  [ok] Visits extracted to output/visits/ (.html + .json per visit)");
    console.log("  [ok] Medications extracted to output/medications/ (.html + .json)");
    console.log("  [ok] Messages extracted to output/messages/ (.html + .json per thread)");
    console.log("  [ok] Browse everything: open output/index.html");
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

main().catch((err) => {
  console.error();
  console.error("Unexpected error:");
  console.error(err);
  process.exit(1);
});
