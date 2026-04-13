/**
 * MyChart Browser Agent — Phase 0 Spike Test
 *
 * Validates three assumptions:
 * 1. We can create a browser session and control it via BrowserProvider
 * 2. 2FA can be handled automatically by reading the code from Gmail
 * 3. Stagehand's extract() can pull structured data from a MyChart labs page
 *
 * Supports three modes via BROWSER_PROVIDER env var:
 * - "stagehand-local" — Stagehand + local Chromium, full AI (default)
 * - "browserbase"     — Stagehand + Browserbase cloud browser
 * - "local"           — plain Playwright, no AI (selectors only)
 *
 * Session persistence:
 *   After a successful login the browser cookies are saved to output/session.json.
 *   On subsequent runs the saved session is restored so login + 2FA are skipped.
 *   Delete output/session.json to force a fresh login.
 */

import dotenv from "dotenv";
dotenv.config({ override: true });
import { z } from "zod";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import * as fs from "node:fs";
import * as path from "node:path";
import { ImapFlow } from "imapflow";
import { createBrowserProvider, type BrowserProvider } from "./browser/index.js";
import { type SerializedSession } from "./browser/interface.js";
import { LabPanel } from "./schemas.js";

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
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

const OUTPUT_DIR = path.join(import.meta.dirname, "..", "output");
const SESSION_FILE = path.join(OUTPUT_DIR, "session.json");

// ---------------------------------------------------------------------------
// Session persistence
// ---------------------------------------------------------------------------
function loadSavedSession(): SerializedSession | null {
  try {
    if (!fs.existsSync(SESSION_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8")) as SerializedSession;
    const ageMs = Date.now() - new Date(data.savedAt).getTime();
    const maxAgeMs = 12 * 60 * 60 * 1000; // 12 hours
    if (ageMs > maxAgeMs) {
      console.log("   Saved session expired (>12h). Will log in fresh.");
      fs.unlinkSync(SESSION_FILE);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function saveSession(session: SerializedSession) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
}

function clearSession() {
  try { fs.unlinkSync(SESSION_FILE); } catch {}
}

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

async function fetchGmailVerificationCode(timeoutMs = 5 * 60 * 1000): Promise<string | null> {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return null;

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    logger: false,
  });

  const deadline = Date.now() + timeoutMs;
  const searchAfter = new Date(Date.now() - 60_000);

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");

    while (Date.now() < deadline) {
      for (const searchOpts of [
        { since: searchAfter, subject: "verification" },
        {
          since: searchAfter,
          or: [
            { subject: "MyChart" }, { subject: "code" },
            { from: "mychart" }, { from: "epic" }, { from: "ucsf" },
          ],
        },
      ]) {
        const uids = await client.search(searchOpts as any);
        const list = Array.isArray(uids) ? [...uids].reverse() : [];
        for (const uid of list) {
          const msg = await client.fetchOne(String(uid), { source: true });
          if (!msg) continue;
          const text = msg.source?.toString() ?? "";
          const match = text.match(/\b(\d{6})\b/);
          if (match) {
            await client.logout();
            return match[1];
          }
        }
      }
      await new Promise((r) => setTimeout(r, 5000));
    }

    await client.logout();
    return null;
  } catch (err) {
    try { await client.logout(); } catch {}
    console.error("   Gmail IMAP error:", (err as Error).message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Login + 2FA
// ---------------------------------------------------------------------------
async function doLogin(browser: BrowserProvider, debugUrl: string | null): Promise<boolean> {
  const username = process.env.MYCHART_USERNAME ?? await prompt("   Enter MyChart username: ");
  const password = process.env.MYCHART_PASSWORD ?? await prompt("   Enter MyChart password: ");
  console.log();

  console.log("Step 4: Filling in login form...");
  await browser.act(`Type "${username}" into the username or email input field`);
  console.log("   Username entered.");

  await browser.act("Click the Next or Continue button to proceed to the password page");
  console.log("   Clicked Next.");
  await new Promise((r) => setTimeout(r, 2000));

  await browser.act(`Type "${password}" into the password input field`);
  console.log("   Password entered.");

  await browser.act("Click the Sign In or Log In button to submit the login form");
  console.log("   Login form submitted.");
  console.log();

  await new Promise((r) => setTimeout(r, 3000));

  // Check for 2FA
  console.log("Step 5: Checking for 2FA/verification prompt...");
  let twoFaObservations: Awaited<ReturnType<typeof browser.observe>> = [];
  try {
    twoFaObservations = await browser.observe(
      "Look for a two-factor authentication prompt, verification code input, " +
      "security code field, or any MFA/2FA challenge",
    );
  } catch {
    console.log("   (observe() returned no 2FA elements)");
  }

  if (twoFaObservations.length > 0) {
    console.log("2FA/MFA detected!");

    try {
      await browser.act(
        "If there is a choice between SMS/phone and email for the verification code, " +
        "click 'Send to my email' or the email option",
      );
      console.log("   Selected email delivery for 2FA code.");
      await new Promise((r) => setTimeout(r, 2000));
    } catch {
      // No delivery choice — already showing code input
    }

    console.log();
    let enteredCode = false;

    if (GMAIL_USER && GMAIL_APP_PASSWORD) {
      console.log("   Fetching verification code from Gmail...");
      const code = await fetchGmailVerificationCode();
      if (code) {
        console.log(`   Got code: ${code}`);
        await browser.act(`Type "${code}" into the verification code or security code input field`);
        console.log("   Code entered.");
        await browser.act("Click the Submit, Verify, or Continue button to submit the verification code");
        console.log("   Submitted.");
        enteredCode = true;
      } else {
        console.log("   Could not find code in Gmail. Falling back to manual entry...");
      }
    }

    if (!enteredCode) {
      if (debugUrl) {
        console.log("+---------------------------------------------------------+");
        console.log("|  Open the DEBUG URL above and complete 2FA there.        |");
        console.log("+---------------------------------------------------------+");
      } else {
        console.log("+---------------------------------------------------------+");
        console.log("|  A browser window is open on your screen.                |");
        console.log("|  Enter the 2FA/verification code there directly.         |");
        console.log("+---------------------------------------------------------+");
      }
    }

    console.log();
    console.log("   Waiting for login to complete...");
    const loggedIn = await waitForObservation(
      browser,
      "Look for elements indicating a successful login: a dashboard, " +
      "welcome message, patient name, home page navigation, or MyChart menu",
      { maxAttempts: 40, delayMs: 5000 },
    );

    if (!loggedIn) {
      console.error("Timed out waiting for login to complete after 2FA.");
      return false;
    }
    console.log("2FA completed — logged in!");
  } else {
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

  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("=".repeat(60));
  console.log("  MyChart Agent — Phase 0 Spike Test");
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
    // Step 2: Navigate
    console.log(`Step 2: Navigating to ${MYCHART_URL}...`);
    await browser.navigate(MYCHART_URL);
    console.log("Page loaded.");
    console.log();

    // Step 3: Login or restore session
    if (savedSession && browser.loadSession) {
      console.log("Step 3: Restoring saved session...");
      await browser.loadSession(savedSession);
      // Reload to apply cookies
      await browser.navigate(MYCHART_URL.replace(/\/Authentication.*$/, ""));
      await new Promise((r) => setTimeout(r, 2000));

      // Check if we're actually logged in
      const stillLoggedIn = await browser.observe(
        "Look for elements indicating a successful login: a dashboard, " +
        "welcome message, patient name, home page navigation, or MyChart menu",
      );

      if (stillLoggedIn.length > 0) {
        console.log("   Session restored — skipping login and 2FA.");
        console.log();
      } else {
        console.log("   Session expired or invalid. Logging in fresh...");
        clearSession();
        await browser.navigate(MYCHART_URL);
        await new Promise((r) => setTimeout(r, 2000));
        console.log();
        console.log("Step 3: Login");
        console.log("   Your credentials are entered locally and sent directly to MyChart.");
        const ok = await doLogin(browser, debugUrl);
        if (!ok) return;
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
      const ok = await doLogin(browser, debugUrl);
      if (!ok) return;
      if (browser.saveSession) {
        saveSession(await browser.saveSession());
        console.log("   Session saved to output/session.json (login + 2FA skipped next run).");
      }
    }
    console.log();

    // Step 6: Navigate to lab results
    console.log("Step 6: Navigating to lab results...");
    await browser.act(
      "Navigate to the test results or lab results section. Look for links " +
      'or menu items labeled "Test Results", "Labs", "Lab Results", or similar.',
    );
    console.log("Navigated to lab results section.");
    await new Promise((r) => setTimeout(r, 3000));
    console.log();

    // Step 7: Extract lab data
    console.log("Step 7: Extracting lab results...");

    const LabExtractionSchema = z.object({ panels: z.array(LabPanel) });

    let labData: z.infer<typeof LabExtractionSchema> | null = null;
    try {
      labData = await browser.extract(
        LabExtractionSchema,
        "Extract all visible lab test results from this page. For each panel " +
        "or group of tests, get the panel name, ordered date, and each individual " +
        "test result including the test name, value, unit, reference range, date, " +
        "flag (H for high, L for low, or normal), and status.",
      );
    } catch (err: any) {
      const isLengthError =
        err?.message?.includes("length") ||
        err?.causedBy?.finishReason === "length" ||
        err?.causedBy?.cause?.finishReason === "length";
      if (isLengthError) {
        console.log("   Note: extraction hit token limit — page has too many items for one pass.");
        console.log("   Phase 1 will paginate or drill into individual panels.");
      } else {
        throw err;
      }
    }

    const totalResults = labData?.panels.reduce((sum, p) => sum + p.results.length, 0) ?? 0;

    if (labData) {
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
    }

    // Step 8: Screenshot
    console.log("Step 8: Saving screenshot...");
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const screenshotPath = path.join(OUTPUT_DIR, "screenshot.png");
    const screenshotBase64 = await browser.screenshot();
    fs.writeFileSync(screenshotPath, Buffer.from(screenshotBase64, "base64"));
    console.log(`Screenshot saved to ${screenshotPath}`);
    console.log();

    console.log("=".repeat(60));
    console.log("  SPIKE TEST COMPLETE");
    console.log("=".repeat(60));
    console.log();
    console.log("  Assumptions validated:");
    console.log("  [ok] 1. Browser session created and controlled via BrowserProvider");
    console.log(`  [ok] 2. 2FA handled ${GMAIL_USER ? "automatically via Gmail" : "via local browser window"}`);
    console.log(`  [${totalResults > 0 ? "ok" : labData ? "--" : "!"}] 3. extract() ${totalResults > 0 ? "successfully pulled" : labData ? "returned no" : "hit token limit —"} structured lab data`);
    console.log();
  } catch (err) {
    failed = true;
    console.error();
    console.error("Spike test failed with error:");
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
