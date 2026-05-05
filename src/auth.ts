import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ImapFlow } from "imapflow";
import { type BrowserProvider } from "./browser/interface.js";
import { type ObserveResult } from "./browser/interface.js";
import { extractVerificationCode } from "./imap.js";
import { clearSession, saveSession, loadSavedSession } from "./session.js";

const OUTPUT_DIR = path.join(import.meta.dirname, "..", "output");

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
    u.includes("login")
  );
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

export async function doLogin(browser: BrowserProvider, debugUrl: string | null): Promise<void> {
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
  let twoFaObservations: ObserveResult[] = [];
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
      if (!isAuthPage(url)) {
        loggedIn = true;
        break;
      }
      console.log(`   Waiting... (${i + 1}/40)`);
      await new Promise((r) => setTimeout(r, 5000));
    }

    if (!loggedIn) {
      throw new Error("Timed out waiting for login to complete after 2FA.");
    }
    console.log(`2FA completed — logged in! URL: ${await browser.url()}`);
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

export async function ensureLoggedIn(
  browser: BrowserProvider,
  mychartUrl: string,
): Promise<void> {
  // Navigate to the saved home URL (e.g. /UCSFMyChart/Home/) to put us in a
  // known state for act() navigation and to verify the session is alive.
  // Do NOT navigate to the login URL — that triggers ?action=logout when already authenticated.
  const savedSession = loadSavedSession();
  const homeUrl = savedSession?.homeUrl;
  if (homeUrl) {
    await browser.navigate(homeUrl);
    await new Promise((r) => setTimeout(r, 2000));
  }
  const currentUrl = await browser.url();
  if (!isAuthPage(currentUrl)) return;

  console.log(`   Session expired — on auth page: ${currentUrl}`);
  console.log("   Re-authenticating...");
  clearSession();
  await browser.navigate(mychartUrl);
  await new Promise((r) => setTimeout(r, 2000));
  await doLogin(browser, null);
  if (browser.saveSession) {
    const session = await browser.saveSession();
    session.homeUrl = await browser.url();
    saveSession(session);
    console.log("   Session re-saved.");
  }
}
