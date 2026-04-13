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
import { LabPanel, Visit, Medication, Message } from "./schemas.js";

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
// Only use Gmail if credentials look real (not the example placeholder)
const GMAIL_USER = process.env.GMAIL_USER?.includes("@") && process.env.GMAIL_USER !== "you@gmail.com"
  ? process.env.GMAIL_USER : undefined;
const GMAIL_APP_PASSWORD = GMAIL_USER ? process.env.GMAIL_APP_PASSWORD : undefined;

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
  const searchAfter = new Date(Date.now() - 5 * 60_000); // look back 5 min

  try {
    await client.connect();

    // Search INBOX first, then Gmail spam folder as fallback
    const mailboxes = ["INBOX", "[Gmail]/Spam", "[Gmail]/All Mail"];
    let openedMailbox = "";

    for (const mailbox of mailboxes) {
      try {
        await client.mailboxOpen(mailbox);
        openedMailbox = mailbox;
        break;
      } catch {
        // Mailbox might not exist — try next
      }
    }

    if (!openedMailbox) {
      console.log("   Gmail: could not open any mailbox.");
      await client.logout();
      return null;
    }

    // Track which UIDs we've already checked to avoid re-reading the same messages
    const checkedUids = new Set<number>();
    let pollCount = 0;

    while (Date.now() < deadline) {
      pollCount++;

      // Search without a `since` filter — IMAP `since` uses date-only and timezone
      // semantics that can exclude today's emails near midnight UTC. Instead, we
      // fetch the last N emails and filter by recency ourselves.
      for (const searchOpts of [
        { subject: "verification" },
        { subject: "MyChart" },
        { from: "ucsf" },
        { from: "mychart" },
        { from: "epic" },
      ] as const) {
        const uids = await client.search(searchOpts as any);
        const list = (Array.isArray(uids) ? uids : []) as number[];
        // Only look at emails we haven't checked yet, newest first
        const newUids = list.filter((u) => !checkedUids.has(u)).reverse();

        for (const uid of newUids) {
          checkedUids.add(uid);
          const msg = await client.fetchOne(String(uid), { source: true, envelope: true }) as any;
          if (!msg?.source) continue;

          // Only consider emails from the last 30 minutes
          const emailDate = msg.envelope?.date ? new Date(msg.envelope.date) : null;
          if (emailDate && Date.now() - emailDate.getTime() > 30 * 60_000) continue;

          const raw = (msg.source as Buffer).toString("utf8");
          // Skip email headers (separated from body by double CRLF)
          // Header IDs/routing numbers must not be mistaken for the code.
          const bodyStart = raw.indexOf("\r\n\r\n");
          const body = bodyStart >= 0 ? raw.slice(bodyStart + 4) : raw;
          // Prefer code near "code:" context phrase for precision
          const contextMatch =
            body.match(/code[:\s]+(\d{6})/i) ??
            body.match(/verification code is:?\s*(\d{6})/i) ??
            body.match(/(\d{6})\s+This code will expire/i);
          const match = contextMatch ?? body.match(/(?<![0-9])(\d{6})(?![0-9])/);
          if (match) {
            const code = match[1];
            console.log(`   Gmail: found code ${code} (email: ${msg.envelope?.subject})`);
            await client.logout();
            return code;
          }
        }
      }

      if (pollCount === 1) {
        console.log(`   Gmail: no code yet in ${openedMailbox}, polling every 5s...`);
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
async function doLogin(browser: BrowserProvider, debugUrl: string | null): Promise<void> {
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
        console.log("   Could not find code in Gmail. Falling back to file-based entry...");
      }
    }

    if (!enteredCode) {
      // File-based 2FA: write output/2fa.needed, watch output/2fa.code for the code.
      // To provide the code: echo "123456" > output/2fa.code
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      const neededFile = path.join(OUTPUT_DIR, "2fa.needed");
      const codeFile = path.join(OUTPUT_DIR, "2fa.code");

      console.log("+=======================================================+");
      console.log("|  2FA CODE NEEDED                                       |");
      console.log("|  Provide the code by running:                          |");
      console.log(`|    echo "XXXXXX" > output/2fa.code                     |`);
      console.log(`|  Watching: ${codeFile}`);
      console.log("+=======================================================+");

      // Use fs.watch (event-driven) + a 5-minute timeout
      const code = await new Promise<string | null>((resolve) => {
        const timeout = setTimeout(() => {
          watcher.close();
          resolve(null);
        }, 5 * 60 * 1000);

        // Check immediately — the code may have been pre-placed (e.g., manually or by a helper)
        if (fs.existsSync(codeFile)) {
          clearTimeout(timeout);
          resolve(fs.readFileSync(codeFile, "utf8").trim());
          return;
        }

        // Signal that we're waiting, then clear any stale code file
        fs.writeFileSync(neededFile, new Date().toISOString());
        try { fs.unlinkSync(codeFile); } catch {}

        const watcher = fs.watch(OUTPUT_DIR, (_event, filename) => {
          if (filename === "2fa.code" && fs.existsSync(codeFile)) {
            clearTimeout(timeout);
            watcher.close();
            resolve(fs.readFileSync(codeFile, "utf8").trim());
          }
        });

        // Also poll every 10s as a fallback (fs.watch can be unreliable on some systems)
        const poll = setInterval(() => {
          if (fs.existsSync(codeFile)) {
            clearTimeout(timeout);
            clearInterval(poll);
            watcher.close();
            resolve(fs.readFileSync(codeFile, "utf8").trim());
          }
        }, 10_000);
      });

      try { fs.unlinkSync(codeFile); } catch {}
      try { fs.unlinkSync(neededFile); } catch {}

      if (code) {
        console.log(`   Got code: ${code}`);
        await browser.act(`Type "${code}" into the verification code or security code input field`);
        console.log("   Code entered.");
        await browser.act("Click the Submit, Verify, or Continue button to submit the verification code");
        console.log("   Submitted.");
        enteredCode = true;
      } else {
        console.log("   No code received. Continuing to poll for browser-based entry...");
      }
    }

    console.log();
    console.log("   Waiting for login to complete...");
    // Wait for the URL to move away from authentication/2FA pages
    let loggedIn = false;
    for (let i = 0; i < 40; i++) {
      const url = await browser.url();
      if (
        !url.toLowerCase().includes("authentication") &&
        !url.toLowerCase().includes("twofactor") &&
        !url.toLowerCase().includes("verif") &&
        !url.toLowerCase().includes("login")
      ) {
        loggedIn = true;
        break;
      }
      console.log(`   Waiting... (${i + 1}/40)`);
      await new Promise((r) => setTimeout(r, 5000));
    }

    if (!loggedIn) {
      throw new Error("Timed out waiting for login to complete after 2FA.");
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

}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Sanitize a string for use in a filename */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "unknown";
}

/**
 * Navigate to the MyChart home page and re-authenticate if the session has
 * expired (detected by landing on the login/authentication URL).  Called
 * before each extraction section so a long-running labs crawl doesn't leave
 * subsequent sections hitting the login page.
 */
async function ensureLoggedIn(browser: BrowserProvider): Promise<void> {
  const homeUrl = MYCHART_URL.replace(/\/Authentication.*$/, "");
  await browser.navigate(homeUrl);
  await new Promise((r) => setTimeout(r, 2000));
  const url = await browser.url();
  const expired =
    url.toLowerCase().includes("authentication") ||
    url.toLowerCase().includes("login");
  if (!expired) return;

  console.log("   Session expired — re-authenticating...");
  clearSession();
  await browser.navigate(MYCHART_URL);
  await new Promise((r) => setTimeout(r, 2000));
  await doLogin(browser, null);
  if (browser.saveSession) {
    saveSession(await browser.saveSession());
    console.log("   Session re-saved.");
  }
}

/** Check whether a section's output directory already has files of the given extension */
function sectionDone(dir: string, ext = ".md"): boolean {
  try {
    return fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * Navigate with one automatic retry on timeout/network errors.
 * Waits 5 seconds before retrying.
 */
async function navigateWithRetry(browser: BrowserProvider, url: string): Promise<void> {
  try {
    await browser.navigate(url);
  } catch (err: any) {
    const isNetworkError = /ERR_TIMED_OUT|ERR_CONNECTION|net::ERR/i.test(err?.message ?? "");
    if (!isNetworkError) throw err;
    console.log(`   Navigation failed (${err.message?.slice(0, 60)}...) — retrying in 5s`);
    await new Promise((r) => setTimeout(r, 5000));
    await browser.navigate(url);
  }
}

/** Check if the item at index i already has an HTML file saved in dir */
function itemAlreadySaved(dir: string, index: number): boolean {
  const prefix = String(index + 1).padStart(3, "0") + "_";
  try {
    return fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.startsWith(prefix) && f.endsWith(".html"));
  } catch {
    return false;
  }
}

/** Minimal CSS injected into every saved document page */
const DOC_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         max-width: 900px; margin: 0 auto; padding: 24px; color: #1a1a1a; }
  h1,h2,h3 { color: #0056b3; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; font-size: 0.9em; }
  th { background: #f0f4f8; }
  .meta { font-size: 0.8em; color: #666; border-bottom: 1px solid #eee;
          padding-bottom: 8px; margin-bottom: 16px; }
  a { color: #0056b3; }
  img { max-width: 100%; }
`.trim();

/**
 * Save the current page as a self-contained HTML document.
 * Uses pageHtml() (raw innerHTML, no AI) — captures tables, formatting, and
 * narrative text that Zod schema extraction would miss.
 */
async function savePageAsHtml(
  browser: BrowserProvider,
  dir: string,
  filename: string,
): Promise<void> {
  const title = await browser.title();
  const url = await browser.url();
  const content = await browser.pageHtml();
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title.replace(/</g, "&lt;")}</title>
<style>${DOC_CSS}</style>
</head>
<body>
<div class="meta">
  <strong>Source:</strong> <a href="${url}">${url}</a><br>
  <strong>Extracted:</strong> ${new Date().toISOString()}
</div>
${content}
</body>
</html>`;
  fs.writeFileSync(path.join(dir, filename), html, "utf8");
}

/**
 * Build a top-level index.html in OUTPUT_DIR that links to every extracted
 * document across all sections.  Called once at the end of main().
 */
function buildIndex(): void {
  const sections: Array<{ name: string; subdir: string; ext: string }> = [
    { name: "Lab Results", subdir: "labs", ext: ".html" },
    { name: "Visits", subdir: "visits", ext: ".html" },
    { name: "Medications", subdir: "medications", ext: ".html" },
    { name: "Messages", subdir: "messages", ext: ".html" },
  ];

  let body = `<h1>MyChart Health Records</h1>\n<p class="meta">Generated: ${new Date().toISOString()}</p>\n`;

  for (const { name, subdir, ext } of sections) {
    const dir = path.join(OUTPUT_DIR, subdir);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(ext)).sort();
    if (files.length === 0) continue;
    body += `<h2>${name} (${files.length})</h2>\n<ul>\n`;
    for (const f of files) {
      const label = f.replace(ext, "").replace(/^\d+_/, "").replace(/-/g, " ");
      body += `  <li><a href="${subdir}/${f}">${label}</a></li>\n`;
    }
    body += `</ul>\n`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MyChart Health Records</title>
<style>${DOC_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
  fs.writeFileSync(path.join(OUTPUT_DIR, "index.html"), html, "utf8");
  console.log(`   Index saved to output/index.html`);
}

// ---------------------------------------------------------------------------
// Section extractors
// ---------------------------------------------------------------------------

/**
 * Step 6b: Drill into every lab/test-result panel and save each one as a
 * standalone Markdown document.  This captures full narrative text (radiology
 * reports, pathology, etc.) that the structured LabPanel schema misses.
 *
 * Output: output/labs/{slug}.md  — one file per panel.
 * Skip: if output/labs/ already has .md files (set FORCE_LABS=1 to re-run).
 */
async function extractLabsDocs(browser: BrowserProvider): Promise<void> {
  const labsDir = path.join(OUTPUT_DIR, "labs");
  fs.mkdirSync(labsDir, { recursive: true });

  if (sectionDone(labsDir, ".html") && process.env.FORCE_LABS !== "1") {
    const count = fs.readdirSync(labsDir).filter((f) => f.endsWith(".html")).length;
    console.log(
      `Step 6b: Labs docs already extracted (${count} .html files) — skipping (FORCE_LABS=1 to re-run).`,
    );
    return;
  }

  console.log("Step 6b: Navigating to lab/test results for full-document extraction...");
  await ensureLoggedIn(browser);
  await browser.act(
    'Navigate to the Test Results or Lab Results section. Look for links or menu items ' +
    'labeled "Test Results", "Labs", "Lab Results", or similar.',
  );
  await new Promise((r) => setTimeout(r, 3000));

  const panelLinks = await browser.observe(
    "Find all clickable lab result or test result entries on this page. " +
    "Each entry is a row or link representing a specific lab panel or test result (e.g. CBC, MRI, Lipid Panel). " +
    "Return each one as a separate result.",
  );
  console.log(`   Found ${panelLinks.length} panel link(s).`);

  if (panelLinks.length === 0) {
    console.log("   No panels found — saving screenshot.");
    const ss = await browser.screenshot();
    fs.writeFileSync(path.join(labsDir, "labs-list.png"), Buffer.from(ss, "base64"));
    return;
  }

  const listUrl = await browser.url();
  const index: Array<{ filename: string; title: string; url: string }> = [];
  const maxPanels = Math.min(panelLinks.length, 50);

  for (let i = 0; i < maxPanels; i++) {
    const link = panelLinks[i];

    if (itemAlreadySaved(labsDir, i)) {
      console.log(`   Doc ${i + 1}/${maxPanels}: already saved — skipping`);
      continue;
    }

    console.log(`   Doc ${i + 1}/${maxPanels}: ${link.description}`);
    try {
      await browser.act(`Click the element: ${link.description}`);
      await new Promise((r) => setTimeout(r, 2500));

      const docUrl = await browser.url();
      // Use the observe() description (contains panel name + date) rather than
      // the generic page title ("UCSF MyChart - Test Details") for every file.
      const cleanDesc = link.description
        .replace(/^Lab\/test result entry:\s*/i, "")
        .replace(/\s*\((Lab|Imaging|Radiology|Pathology)\)/gi, "");
      const filename = `${String(i + 1).padStart(3, "0")}_${slugify(cleanDesc || link.description)}.html`;
      await savePageAsHtml(browser, labsDir, filename);
      index.push({ filename, title: cleanDesc || link.description, url: docUrl });
      console.log(`      → saved ${filename}`);
    } catch (err: any) {
      console.log(`      → error: ${err?.message ?? err}`);
      try {
        const ss = await browser.screenshot();
        fs.writeFileSync(
          path.join(labsDir, `${String(i + 1).padStart(3, "0")}_error.png`),
          Buffer.from(ss, "base64"),
        );
      } catch {}
    }
    await navigateWithRetry(browser, listUrl);
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Write a simple index file so the folder is easy to browse
  fs.writeFileSync(
    path.join(labsDir, "index.json"),
    JSON.stringify(index, null, 2),
    "utf8",
  );
  console.log(`   Labs docs saved to ${labsDir} (${index.length} documents)`);
}

async function extractVisits(browser: BrowserProvider): Promise<void> {
  const visitsDir = path.join(OUTPUT_DIR, "visits");
  fs.mkdirSync(visitsDir, { recursive: true });

  if (sectionDone(visitsDir, ".html") && process.env.FORCE_VISITS !== "1") {
    const count = fs.readdirSync(visitsDir).filter((f) => f.endsWith(".html")).length;
    console.log(
      `Step 9: Visits already extracted (${count} .html files) — skipping (FORCE_VISITS=1 to re-run).`,
    );
    return;
  }

  console.log("Step 9: Navigating to visits...");
  await ensureLoggedIn(browser);
  await browser.act(
    'Click the Visits link in the navigation menu. It may be labeled "Visits", ' +
    '"Past Visits", or "Appointments". It is usually in the top navigation bar or sidebar.',
  );
  await new Promise((r) => setTimeout(r, 3000));

  const visitLinks = await browser.observe(
    "Find all clickable past visit or appointment entries on this page. " +
    "Each entry is a row or link for a specific visit with a date and provider. " +
    "Return each one separately.",
  );
  console.log(`   Found ${visitLinks.length} visit link(s).`);

  if (visitLinks.length === 0) {
    console.log("   No visits found — saving screenshot.");
    const ss = await browser.screenshot();
    fs.writeFileSync(path.join(visitsDir, "visits-list.png"), Buffer.from(ss, "base64"));
    return;
  }

  const listUrl = await browser.url();
  const errors: string[] = [];
  const maxVisits = Math.min(visitLinks.length, 20);

  for (let i = 0; i < maxVisits; i++) {
    const link = visitLinks[i];

    if (itemAlreadySaved(visitsDir, i)) {
      console.log(`   Visit ${i + 1}/${maxVisits}: already saved — skipping`);
      continue;
    }

    console.log(`   Visit ${i + 1}/${maxVisits}: ${link.description}`);
    try {
      await browser.act(`Click the element: ${link.description}`);
      await new Promise((r) => setTimeout(r, 2500));

      // Save full page HTML (primary, human-readable)
      const pageTitle = await browser.title();
      const htmlFilename = `${String(i + 1).padStart(3, "0")}_${slugify(pageTitle || link.description)}.html`;
      await savePageAsHtml(browser, visitsDir, htmlFilename);

      // Also save structured JSON (secondary, for downstream processing)
      try {
        const VisitSchema = z.object({ visit: Visit });
        const result = await browser.extract(
          VisitSchema,
          "Extract all details about this visit: date, visit type, provider name, " +
          "department, location, reason for visit, diagnoses, and any notes or instructions.",
        );
        const v = result.visit;
        const jsonFilename = `${String(i + 1).padStart(3, "0")}_${slugify(v.date || pageTitle)}_${slugify(v.visitType)}.json`;
        fs.writeFileSync(path.join(visitsDir, jsonFilename), JSON.stringify(v, null, 2));
      } catch {
        // JSON extraction is best-effort; HTML is the primary output
      }

      console.log(`      → saved ${htmlFilename}`);
    } catch (err: any) {
      const msg = `Visit ${i + 1} (${link.description}): ${err?.message ?? String(err)}`;
      console.log(`      → error: ${err?.message ?? err}`);
      errors.push(msg);
      try {
        const ss = await browser.screenshot();
        fs.writeFileSync(path.join(visitsDir, `visit-${i + 1}-error.png`), Buffer.from(ss, "base64"));
      } catch {}
    }
    await navigateWithRetry(browser, listUrl);
    await new Promise((r) => setTimeout(r, 1500));
  }

  if (errors.length > 0) {
    fs.writeFileSync(path.join(visitsDir, "errors.json"), JSON.stringify(errors, null, 2));
  }
  console.log(`   Visits saved to ${visitsDir}`);
}

async function extractMedications(browser: BrowserProvider): Promise<void> {
  const medsDir = path.join(OUTPUT_DIR, "medications");
  fs.mkdirSync(medsDir, { recursive: true });

  const htmlPath = path.join(medsDir, "medications.html");
  if (fs.existsSync(htmlPath) && process.env.FORCE_MEDS !== "1") {
    console.log("Step 10: Medications already extracted — skipping (FORCE_MEDS=1 to re-run).");
    return;
  }

  console.log("Step 10: Navigating to medications...");
  await ensureLoggedIn(browser);
  await browser.act(
    'Click the Medications link in the navigation menu or on the home page. ' +
    'Look for text that says "Medications", "My Medications", or "Medication List".',
  );
  await new Promise((r) => setTimeout(r, 3000));

  // Save full page as HTML (always reliable)
  await savePageAsHtml(browser, medsDir, "medications.html");
  console.log("   Saved medications.html");

  // Also attempt structured extraction
  const MedListSchema = z.object({ medications: z.array(Medication) });
  try {
    const result = await browser.extract(
      MedListSchema,
      "Extract all medications listed on this page. For each medication include: " +
      "full name with strength, dosing instructions, status (active/discontinued), " +
      "prescribing provider, refills remaining, last filled date, and pharmacy.",
    );
    if (result.medications.length > 0) {
      console.log(`   Extracted ${result.medications.length} medication(s).`);
      fs.writeFileSync(
        path.join(medsDir, "medications.json"),
        JSON.stringify(result.medications, null, 2),
      );
    } else {
      console.log("   Structured extraction returned 0 medications (markdown file still saved).");
    }
  } catch (err: any) {
    console.log(`   Structured extraction failed: ${err?.message ?? err} (markdown file still saved).`);
  }
  console.log(`   Medications saved to ${medsDir}`);
}

async function extractMessages(browser: BrowserProvider): Promise<void> {
  const msgsDir = path.join(OUTPUT_DIR, "messages");
  fs.mkdirSync(msgsDir, { recursive: true });

  // Complete skip only if FORCE_MSGS is not set — partial runs resume per-thread
  if (process.env.FORCE_MSGS === "1") {
    // Clear dir for full re-run
    fs.readdirSync(msgsDir).forEach((f) => fs.unlinkSync(path.join(msgsDir, f)));
  }

  console.log("Step 11: Navigating to messages...");
  await ensureLoggedIn(browser);
  await browser.act(
    'Click the Messages or Inbox link in the navigation menu. ' +
    'It may be labeled "Messages", "Inbox", or "MyChart Messages".',
  );
  await new Promise((r) => setTimeout(r, 3000));

  const threadLinks = await browser.observe(
    "Find all clickable message threads or conversations on this page. " +
    "Each entry is a row with a subject line, sender, and date. Return each one separately.",
  );
  console.log(`   Found ${threadLinks.length} message thread(s).`);

  if (threadLinks.length === 0) {
    console.log("   No messages found — saving screenshot.");
    const ss = await browser.screenshot();
    fs.writeFileSync(path.join(msgsDir, "inbox.png"), Buffer.from(ss, "base64"));
    return;
  }

  const listUrl = await browser.url();
  const errors: string[] = [];
  const maxThreads = Math.min(threadLinks.length, 50);

  for (let i = 0; i < maxThreads; i++) {
    const link = threadLinks[i];

    // Resume support: skip threads already saved from a prior partial run
    if (itemAlreadySaved(msgsDir, i)) {
      console.log(`   Thread ${i + 1}/${maxThreads}: already saved — skipping`);
      continue;
    }

    console.log(`   Thread ${i + 1}/${maxThreads}: ${link.description}`);
    try {
      await browser.act(`Click the element: ${link.description}`);
      await new Promise((r) => setTimeout(r, 2000));

      // Save full page HTML (primary)
      const pageTitle = await browser.title();
      const htmlFilename = `${String(i + 1).padStart(3, "0")}_${slugify(pageTitle || link.description)}.html`;
      await savePageAsHtml(browser, msgsDir, htmlFilename);

      // Also save structured JSON (secondary)
      try {
        const MsgSchema = z.object({ message: Message });
        const result = await browser.extract(
          MsgSchema,
          "Extract the full message thread: subject, sender name, date, full message body text, " +
          "and any reply messages (each with sender, date, and body text).",
        );
        const m = result.message;
        const jsonFilename = `${String(i + 1).padStart(3, "0")}_${slugify(m.date)}_${slugify(m.subject)}.json`;
        fs.writeFileSync(path.join(msgsDir, jsonFilename), JSON.stringify(m, null, 2));
      } catch {
        // JSON is best-effort; HTML is the primary output
      }

      console.log(`      → saved ${htmlFilename}`);
    } catch (err: any) {
      const msg = `Thread ${i + 1} (${link.description}): ${err?.message ?? String(err)}`;
      console.log(`      → error: ${err?.message ?? err}`);
      errors.push(msg);
      try {
        const ss = await browser.screenshot();
        fs.writeFileSync(path.join(msgsDir, `thread-${i + 1}-error.png`), Buffer.from(ss, "base64"));
      } catch {}
    }
    await navigateWithRetry(browser, listUrl);
    await new Promise((r) => setTimeout(r, 1500));
  }

  if (errors.length > 0) {
    fs.writeFileSync(path.join(msgsDir, "errors.json"), JSON.stringify(errors, null, 2));
  }
  console.log(`   Messages saved to ${msgsDir}`);
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

      // Check if we're actually logged in by inspecting the current URL.
      // After cookie restore + navigation, a valid session stays on the home page;
      // an expired/invalid session gets redirected to the login/Authentication page.
      const currentUrl = await browser.url();
      const isLoggedIn =
        !currentUrl.toLowerCase().includes("authentication") &&
        !currentUrl.toLowerCase().includes("login");

      if (isLoggedIn) {
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

    // Step 6-7: Labs extraction (skipped if output/labs.json already has data; set FORCE_LABS=1 to re-extract)
    const labsPath = path.join(OUTPUT_DIR, "labs.json");
    const labsExist = (() => {
      try {
        const d = JSON.parse(fs.readFileSync(labsPath, "utf8"));
        return Array.isArray(d.panels) && d.panels.length > 0;
      } catch { return false; }
    })();

    let totalResults = 0;

    if (labsExist && process.env.FORCE_LABS !== "1") {
      console.log("Step 6-7: Labs already extracted — skipping (set FORCE_LABS=1 to re-extract).");
      try {
        const existing = JSON.parse(fs.readFileSync(labsPath, "utf8"));
        totalResults = (existing.panels as LabPanel[]).reduce((s, p) => s + p.results.length, 0);
        console.log(`   ${existing.panels.length} panels, ${totalResults} results in labs.json`);
      } catch {}
    } else {
      console.log("Step 6: Navigating to lab results...");
      await browser.act(
        "Navigate to the test results or lab results section. Look for links " +
        'or menu items labeled "Test Results", "Labs", "Lab Results", or similar.',
      );
      console.log("Navigated to lab results section.");
      await new Promise((r) => setTimeout(r, 3000));
      console.log();

      // Step 7: Discover panels then drill into each one for real values
      console.log("Step 7: Discovering lab panels...");

      const panelLinks = await browser.observe(
        "Find all clickable lab result or test result entries on this page. " +
        "Each entry is a row or link representing a specific lab panel (e.g. CBC, Lipid Panel). " +
        "Return each one as a separate result.",
      );
      console.log(`   Found ${panelLinks.length} panel link(s).`);
      console.log();

      const allPanels: LabPanel[] = [];
      const errors: string[] = [];
      const listUrl = await browser.url();

      const panelsToVisit = panelLinks.slice(0, 30);
      console.log(`Step 7b: Drilling into ${panelsToVisit.length} panels...`);

      for (let i = 0; i < panelsToVisit.length; i++) {
        const link = panelsToVisit[i];
        console.log(`   Panel ${i + 1}/${panelsToVisit.length}: ${link.description}`);

        try {
          await browser.act(`Click the element: ${link.description}`);
          await new Promise((r) => setTimeout(r, 2000));

          const PanelSchema = z.object({ panel: LabPanel });
          const result = await browser.extract(
            PanelSchema,
            "Extract the lab panel name, the date it was ordered or resulted, and all " +
            "individual test results on this page. For each test include: name, value, " +
            "unit, reference range, flag (H/L/normal), and status.",
          );

          allPanels.push(result.panel);
          console.log(`      → ${result.panel.results.length} result(s) extracted`);
        } catch (err: any) {
          const msg = `Panel ${i + 1} (${link.description}): ${err?.message ?? String(err)}`;
          console.log(`      → error: ${err?.message ?? err}`);
          errors.push(msg);
        }

        await navigateWithRetry(browser, listUrl);
        await new Promise((r) => setTimeout(r, 1500));
      }

      totalResults = allPanels.reduce((sum, p) => sum + p.results.length, 0);

      console.log();
      console.log("=".repeat(60));
      console.log("  EXTRACTED LAB DATA");
      console.log("=".repeat(60));
      console.log(`  Panels visited: ${panelsToVisit.length}`);
      console.log(`  Panels extracted: ${allPanels.length}`);
      console.log(`  Total individual results: ${totalResults}`);
      if (errors.length > 0) {
        console.log(`  Errors: ${errors.length}`);
        errors.forEach((e) => console.log(`    - ${e}`));
      }
      console.log();

      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      fs.writeFileSync(labsPath, JSON.stringify({ panels: allPanels, errors }, null, 2));
      console.log(`Lab data saved to ${labsPath}`);
    }

    // Step 6b: Labs full-document extraction (one .md per panel)
    console.log();
    await extractLabsDocs(browser);
    console.log();

    // Step 8: Screenshot of labs page
    console.log("Step 8: Saving labs screenshot...");
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const screenshotPath = path.join(OUTPUT_DIR, "screenshot.png");
    const screenshotBase64 = await browser.screenshot();
    fs.writeFileSync(screenshotPath, Buffer.from(screenshotBase64, "base64"));
    console.log(`Screenshot saved to ${screenshotPath}`);
    console.log();

    // Step 9: Visits
    console.log();
    await extractVisits(browser);
    console.log();

    // Step 10: Medications
    console.log();
    await extractMedications(browser);
    console.log();

    // Step 11: Messages
    console.log();
    await extractMessages(browser);
    console.log();

    // Build browsable index
    buildIndex();

    console.log("=".repeat(60));
    console.log("  EXTRACTION COMPLETE");
    console.log("=".repeat(60));
    console.log();
    console.log("  [ok] Labs index extracted to output/labs.json");
    console.log("  [ok] Labs documents extracted to output/labs/ (one .html per panel)");
    console.log("  [ok] Visits extracted to output/visits/ (.html + .json per visit)");
    console.log("  [ok] Medications extracted to output/medications/ (.html + .json)");
    console.log("  [ok] Messages extracted to output/messages/ (.html + .json per thread)");
    console.log("  [ok] Browse everything: open output/index.html");
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
