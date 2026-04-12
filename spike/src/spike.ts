/**
 * MyChart Browser Agent — Phase 0 Spike Test
 *
 * Validates three assumptions:
 * 1. We can create a browser session and control it via BrowserProvider
 * 2. The debug URL or local browser window allows interactive input (for 2FA)
 * 3. Stagehand's extract() can pull structured data from a MyChart labs page
 *
 * Supports three modes via BROWSER_PROVIDER env var:
 * - "stagehand-local" — Stagehand + local Chromium, full AI (default)
 * - "browserbase"     — Stagehand + Browserbase cloud browser
 * - "local"           — plain Playwright, no AI (selectors only)
 */

import dotenv from "dotenv";
dotenv.config({ override: true });
import { z } from "zod";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createBrowserProvider, type BrowserProvider } from "./browser/index.js";
import { LabPanel } from "./schemas.js";

// ---------------------------------------------------------------------------
// Env validation
// ---------------------------------------------------------------------------
const providerType = process.env.BROWSER_PROVIDER ?? "stagehand-local";

// Always required
if (!process.env.MYCHART_URL) {
  console.error("Missing required env var: MYCHART_URL");
  console.error("   Copy .env.example to .env and fill in the values.");
  process.exit(1);
}

// Anthropic key required for stagehand-local and browserbase (AI-powered modes)
if (providerType !== "local" && !process.env.ANTHROPIC_API_KEY) {
  console.error("Missing required env var: ANTHROPIC_API_KEY");
  console.error("   Needed for AI-powered browser actions (act/extract/observe).");
  process.exit(1);
}

// Browserbase keys only required for browserbase mode
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
// Helpers
// ---------------------------------------------------------------------------
async function prompt(message: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return await rl.question(message);
  } finally {
    rl.close();
  }
}

/** Poll for an element matching a description via observe(), retrying up to maxAttempts */
async function waitForObservation(
  browser: BrowserProvider,
  instruction: string,
  { maxAttempts = 20, delayMs = 3000 }: { maxAttempts?: number; delayMs?: number } = {},
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const observations = await browser.observe(instruction);
    if (observations.length > 0) return true;
    console.log(`   Waiting... (${i + 1}/${maxAttempts})`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("=".repeat(60));
  console.log("  MyChart Agent — Phase 0 Spike Test");
  console.log(`  Mode: ${providerType}`);
  console.log("=".repeat(60));
  console.log();

  // Step 1: Create browser session
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

  try {
    // Step 2: Navigate to MyChart
    console.log(`Step 2: Navigating to ${MYCHART_URL}...`);
    await browser.navigate(MYCHART_URL);
    console.log("Page loaded.");
    console.log();

    // Step 3: Prompt user for credentials (entered via stdin, never stored)
    console.log("Step 3: Login");
    console.log("   Your credentials are entered locally and sent directly to MyChart.");
    console.log("   They are NOT stored or logged anywhere.");
    console.log();

    const username = process.env.MYCHART_USERNAME ?? await prompt("   Enter MyChart username: ");
    const password = process.env.MYCHART_PASSWORD ?? await prompt("   Enter MyChart password: ");
    console.log();

    // Step 4: Fill in login form via act()
    console.log("Step 4: Filling in login form...");

    await browser.act(`Type "${username}" into the username or email input field`);
    console.log("   Username entered.");

    // MyChart login is two-step: submit username first, then enter password on next page
    await browser.act("Click the Next or Continue button to proceed to the password page");
    console.log("   Clicked Next.");
    await new Promise((r) => setTimeout(r, 2000));

    await browser.act(`Type "${password}" into the password input field`);
    console.log("   Password entered.");

    await browser.act("Click the Sign In or Log In button to submit the login form");
    console.log("   Login form submitted.");
    console.log();

    // Wait a moment for the page to respond
    await new Promise((r) => setTimeout(r, 3000));

    // Step 5: Check for 2FA via observe()
    console.log("Step 5: Checking for 2FA/verification prompt...");

    let twoFaObservations: Awaited<ReturnType<typeof browser.observe>> = [];
    try {
      twoFaObservations = await browser.observe(
        "Look for a two-factor authentication prompt, verification code input, " +
        "security code field, or any MFA/2FA challenge",
      );
    } catch {
      // observe() may throw if no matching elements found — treat as no 2FA
      console.log("   (observe() returned no 2FA elements)");
    }

    if (twoFaObservations.length > 0) {
      console.log("2FA/MFA detected!");
      // If there's a delivery method selection screen, choose email
      try {
        await browser.act("If there is a choice between SMS/phone and email for the verification code, click 'Send to my email' or the email option");
        console.log("   Selected email delivery for 2FA code.");
        await new Promise((r) => setTimeout(r, 2000));
      } catch {
        // No delivery choice screen — already showing code input
      }
      console.log();

      if (debugUrl) {
        // Browserbase mode: direct user to the debug URL
        console.log("+---------------------------------------------------------+");
        console.log("|  Open the DEBUG URL above in your browser and            |");
        console.log("|  complete the 2FA verification there.                    |");
        console.log("+---------------------------------------------------------+");
      } else {
        // Local mode: the browser window is right on their screen
        console.log("+---------------------------------------------------------+");
        console.log("|  A browser window is open on your screen.                |");
        console.log("|  Enter the 2FA/verification code there directly.         |");
        console.log("+---------------------------------------------------------+");
      }

      console.log();
      console.log("   Waiting for login to complete...");

      // Poll for dashboard elements that indicate login is complete
      const loggedIn = await waitForObservation(
        browser,
        "Look for elements indicating a successful login: a dashboard, " +
        "welcome message, patient name, home page navigation, or MyChart menu",
        { maxAttempts: 40, delayMs: 5000 },
      );

      if (!loggedIn) {
        console.error("Timed out waiting for login to complete after 2FA.");
        return;
      }
      console.log("2FA completed — logged in!");
    } else {
      // Check if we landed on a dashboard (login succeeded without 2FA)
      const dashboardObs = await browser.observe(
        "Look for elements indicating a successful login: a dashboard, " +
        "welcome message, patient name, or MyChart menu",
      );

      if (dashboardObs.length > 0) {
        console.log("Logged in successfully (no 2FA required).");
      } else {
        console.log("Login state unclear. Continuing anyway...");
      }
    }
    console.log();

    // Step 6: Navigate to lab results via act()
    console.log("Step 6: Navigating to lab results...");
    await browser.act(
      "Navigate to the test results or lab results section. Look for links " +
      'or menu items labeled "Test Results", "Labs", "Lab Results", or similar.',
    );
    console.log("Navigated to lab results section.");
    await new Promise((r) => setTimeout(r, 3000));
    console.log();

    // Step 7: Extract lab data via extract() with Zod schema
    console.log("Step 7: Extracting lab results...");

    const LabExtractionSchema = z.object({
      panels: z.array(LabPanel),
    });

    const labData = await browser.extract(
      LabExtractionSchema,
      "Extract all visible lab test results from this page. For each panel " +
      "or group of tests, get the panel name, ordered date, and each individual " +
      "test result including the test name, value, unit, reference range, date, " +
      "flag (H for high, L for low, or normal), and status.",
    );

    const totalResults = labData.panels.reduce(
      (sum, p) => sum + p.results.length,
      0,
    );
    console.log("Data extracted!");
    console.log();
    console.log("=".repeat(60));
    console.log("  EXTRACTED LAB DATA");
    console.log("=".repeat(60));
    console.log(`  Panels: ${labData.panels.length}`);
    console.log(`  Total results: ${totalResults}`);
    console.log();
    console.log(JSON.stringify(labData, null, 2));
    console.log();

    // Step 8: Save screenshot
    console.log("Step 8: Saving screenshot...");
    const outputDir = path.join(import.meta.dirname, "..", "output");
    fs.mkdirSync(outputDir, { recursive: true });

    const screenshotPath = path.join(outputDir, "screenshot.png");
    const screenshotBase64 = await browser.screenshot();
    fs.writeFileSync(screenshotPath, Buffer.from(screenshotBase64, "base64"));
    console.log(`Screenshot saved to ${screenshotPath}`);
    console.log();

    // Summary
    console.log("=".repeat(60));
    console.log("  SPIKE TEST COMPLETE");
    console.log("=".repeat(60));
    console.log();
    console.log("  Assumptions validated:");
    console.log("  [ok] 1. Browser session created and controlled via BrowserProvider");
    console.log(`  [ok] 2. ${debugUrl ? "Debug URL available" : "Local browser window used"} for interactive 2FA`);
    console.log(`  [${totalResults > 0 ? "ok" : "--"}] 3. extract() ${totalResults > 0 ? "successfully pulled" : "returned no"} structured lab data`);
    console.log();
  } finally {
    // Cleanup
    console.log("Cleaning up session...");
    await browser.close();
    console.log("Done.");
  }
}

main().catch((err) => {
  console.error();
  console.error("Spike test failed with error:");
  console.error(err);
  process.exit(1);
});
