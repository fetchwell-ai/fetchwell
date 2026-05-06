/**
 * Shared auth utilities used by all login-form and 2FA strategies.
 *
 * Extracted from the former mychart.ts and onemedical.ts modules to
 * eliminate duplication.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ImapFlow } from "imapflow";
import { type BrowserProvider, type ObserveResult } from "../browser/interface.js";
import { extractVerificationCode } from "../imap.js";
import { clearSession, saveSession, loadSavedSession } from "../session.js";
const OUTPUT_BASE = path.join(import.meta.dirname, "..", "..", "output");

// ---------------------------------------------------------------------------
// Login function registry for ensureLoggedIn
// ---------------------------------------------------------------------------

type LoginFn = (
  browser: BrowserProvider,
  debugUrl: string | null,
  credentials?: { username?: string; password?: string },
  providerId?: string,
) => Promise<void>;

/**
 * Per-provider login function registry. The pipeline registers the composed
 * login function for each provider so that ensureLoggedIn() can re-authenticate
 * without needing the caller to pass the login function.
 */
const loginFnRegistry = new Map<string, LoginFn>();

/**
 * Register a login function for a provider. Call this from the extraction
 * pipeline after composing the auth module so ensureLoggedIn() can
 * re-authenticate when sessions expire mid-crawl.
 */
export function registerLoginFn(providerId: string, fn: LoginFn): void {
  loginFnRegistry.set(providerId, fn);
}

/** Return the output dir for a provider. Falls back to base output dir. */
export function resolveOutputDir(providerId?: string): string {
  return providerId ? path.join(OUTPUT_BASE, providerId) : OUTPUT_BASE;
}

// Only use Gmail if credentials look real (not the example placeholder)
export const GMAIL_USER =
  process.env.GMAIL_USER?.includes("@") && process.env.GMAIL_USER !== "you@gmail.com"
    ? process.env.GMAIL_USER
    : undefined;
export const GMAIL_APP_PASSWORD = GMAIL_USER ? process.env.GMAIL_APP_PASSWORD : undefined;

export function isAuthPage(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("authentication") ||
    u.includes("twofactor") ||
    u.includes("verif") ||
    u.includes("login") ||
    u.includes("/sign-in") ||
    u.includes("/signin") ||
    u.includes("/auth")
  );
}

/**
 * CSS selectors for DOM elements that are only present when the user is
 * authenticated in an Epic MyChart portal. These are checked after session
 * restore to detect the "silent unauthenticated" failure mode where the
 * portal serves the same URL for logged-in and logged-out users.
 *
 * Selectors are matched against common MyChart navigation patterns:
 * - nav links to Visits, Messages, Test Results
 * - user greeting / patient name elements
 * - account/profile menu links
 */
const AUTHENTICATED_SELECTORS = [
  // MyChart global nav links (common across Epic portals)
  'a[href*="Visits"]',
  'a[href*="Messages"]',
  'a[href*="TestResults"]',
  'a[href*="Medications"]',
  'a[href*="Appointments"]',
  // User greeting / account menu
  '[data-testid="account-menu"]',
  '[aria-label*="Account"]',
  '[aria-label*="account"]',
  // MyChart-specific authenticated nav elements
  '.MyChartGlobalNav',
  '#MyChartGlobalNav',
  'nav[aria-label*="MyChart"]',
  // Generic "logged in" indicators
  '[class*="UserGreeting"]',
  '[class*="user-greeting"]',
  '[class*="PatientName"]',
  '[class*="patient-name"]',
];

/**
 * Check whether the browser is currently showing an authenticated MyChart
 * session by looking for known authenticated-only DOM elements.
 *
 * Tries each selector in AUTHENTICATED_SELECTORS and returns true as soon
 * as any one is found. Returns false if none are found (within a short
 * timeout already elapsed from the caller's navigate + delay).
 *
 * This catches the "silent unauthenticated" failure mode where the portal
 * returns HTTP 200 on the home URL regardless of session state.
 */
export async function checkAuthenticatedElement(browser: BrowserProvider): Promise<boolean> {
  for (const selector of AUTHENTICATED_SELECTORS) {
    try {
      const el = await browser.querySelector(selector);
      if (el) {
        return true;
      }
    } catch {
      // querySelector may throw if the page is in a bad state — keep trying
    }
  }
  return false;
}

export async function prompt(message: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return await rl.question(message);
  } finally {
    rl.close();
  }
}

export async function waitForObservation(
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

export async function fetchGmailVerificationCode(timeoutMs = 5 * 60 * 1000): Promise<string | null> {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return null;

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    logger: false,
  });

  const deadline = Date.now() + timeoutMs;

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
        // Mailbox might not exist -- try next
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

      // Search without a `since` filter -- IMAP `since` uses date-only and timezone
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

          const code = extractVerificationCode((msg.source as Buffer).toString("utf8"));
          if (code) {
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

/**
 * File-based 2FA relay: write 2fa.needed, watch for 2fa.code.
 *
 * To provide the code: echo "123456" > output/<provider>/2fa.code
 *
 * Returns the code string, or null if timed out.
 */
export async function waitForFileBasedCode(providerId?: string): Promise<string | null> {
  const outputDir = resolveOutputDir(providerId);
  fs.mkdirSync(outputDir, { recursive: true });
  const neededFile = path.join(outputDir, "2fa.needed");
  const codeFile = path.join(outputDir, "2fa.code");

  const relCodeFile = path.relative(path.join(outputDir, "..", ".."), codeFile);
  console.log("+=======================================================+");
  console.log("|  2FA CODE NEEDED                                       |");
  console.log("|  Provide the code by running:                          |");
  console.log(`|    echo "XXXXXX" > ${relCodeFile}`);
  console.log(`|  Watching: ${codeFile}`);
  console.log("+=======================================================+");

  const code = await new Promise<string | null>((resolve) => {
    const timeout = setTimeout(() => {
      watcher.close();
      resolve(null);
    }, 5 * 60 * 1000);

    // Check immediately -- the code may have been pre-placed
    if (fs.existsSync(codeFile)) {
      clearTimeout(timeout);
      resolve(fs.readFileSync(codeFile, "utf8").trim());
      return;
    }

    // Signal that we're waiting, then clear any stale code file
    fs.writeFileSync(neededFile, new Date().toISOString());
    try { fs.unlinkSync(codeFile); } catch {}

    const watcher = fs.watch(outputDir, (_event, filename) => {
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

  return code;
}

/**
 * Enter a 2FA code into the browser and submit.
 */
export async function enterCodeInBrowser(browser: BrowserProvider, code: string): Promise<void> {
  console.log(`   Got code: ${code}`);
  await browser.act(`Type "${code}" into the verification code or security code input field`);
  console.log("   Code entered.");
  await browser.act("Click the Submit, Verify, or Continue button to submit the verification code");
  console.log("   Submitted.");
}

/**
 * Wait for the browser URL to leave authentication pages after login/2FA.
 */
export async function waitForPostLoginNavigation(
  browser: BrowserProvider,
  { maxAttempts = 40, delayMs = 5000 }: { maxAttempts?: number; delayMs?: number } = {},
): Promise<void> {
  console.log();
  console.log("   Waiting for login to complete...");
  for (let i = 0; i < maxAttempts; i++) {
    const url = await browser.url();
    if (!isAuthPage(url)) {
      console.log(`2FA completed — logged in! URL: ${url}`);
      return;
    }
    console.log(`   Waiting... (${i + 1}/${maxAttempts})`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("Timed out waiting for login to complete after 2FA.");
}

/**
 * Check if 2FA is being requested by observing the page.
 */
export async function detect2FA(browser: BrowserProvider): Promise<ObserveResult[]> {
  try {
    return await browser.observe(
      "Look for a two-factor authentication prompt, verification code input, " +
      "security code field, or any MFA/2FA challenge",
    );
  } catch {
    console.log("   (observe() returned no 2FA elements)");
    return [];
  }
}

/**
 * Check for successful login when no 2FA was required.
 */
export async function verifyLoginSuccess(browser: BrowserProvider): Promise<void> {
  const dashboardObs = await browser.observe(
    "Look for elements indicating a successful login: a dashboard, " +
    "welcome message, patient name, appointments, or health records menu",
  );
  if (dashboardObs.length > 0) {
    console.log("Logged in successfully (no 2FA required).");
  } else {
    console.log("Login state unclear. Continuing anyway...");
  }
}

/**
 * Shared ensureLoggedIn implementation: navigate to saved home URL to check
 * session, re-authenticate if on an auth page.
 *
 * Uses the login function registered via registerLoginFn() for re-auth.
 * The extraction pipeline registers the composed login function when it
 * creates the auth module.
 */
export async function ensureLoggedIn(
  browser: BrowserProvider,
  loginUrl: string,
  credentials?: { username?: string; password?: string },
  providerId?: string,
): Promise<void> {
  // Navigate to the saved home URL (e.g. /UCSFMyChart/Home/) to put us in a
  // known state for act() navigation and to verify the session is alive.
  // Do NOT navigate to the login URL -- that triggers ?action=logout when already authenticated.
  const savedSession = loadSavedSession(providerId);
  const homeUrl = savedSession?.homeUrl;
  if (homeUrl) {
    await browser.navigate(homeUrl);
    await new Promise((r) => setTimeout(r, 2000));
  }
  const currentUrl = await browser.url();

  // Primary check: are we on an auth/login page?
  if (isAuthPage(currentUrl)) {
    console.log(`   Session expired — on auth page: ${currentUrl}`);
    console.log("   Re-authenticating...");
    clearSession(providerId);
    await browser.navigate(loginUrl);
    await new Promise((r) => setTimeout(r, 2000));
    const loginFn = providerId ? loginFnRegistry.get(providerId) : undefined;
    if (loginFn) {
      await loginFn(browser, null, credentials, providerId);
    }
    if (browser.saveSession) {
      const session = await browser.saveSession();
      session.homeUrl = await browser.url();
      saveSession(session, providerId);
      console.log("   Session re-saved.");
    }
    return;
  }

  // Secondary check: even though the URL looks authenticated, verify that
  // authenticated-only DOM elements are present. Some portals return the same
  // URL for logged-in and logged-out users (e.g. /Home/ serves the page either
  // way) so a URL check alone is insufficient.
  const hasAuthElement = await checkAuthenticatedElement(browser);
  if (hasAuthElement) return;

  console.log(`   Session validation failed — URL looks authenticated (${currentUrl}) but no authenticated elements found.`);
  console.log("   Re-authenticating...");
  clearSession(providerId);
  await browser.navigate(loginUrl);
  await new Promise((r) => setTimeout(r, 2000));
  const loginFn = providerId ? loginFnRegistry.get(providerId) : undefined;
  if (loginFn) {
    await loginFn(browser, null, credentials, providerId);
  }
  if (browser.saveSession) {
    const session = await browser.saveSession();
    session.homeUrl = await browser.url();
    saveSession(session, providerId);
    console.log("   Session re-saved.");
  }
}
