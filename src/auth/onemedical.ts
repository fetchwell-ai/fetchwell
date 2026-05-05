/**
 * One Medical authentication module.
 *
 * Implements the AuthModule interface for One Medical (app.onemedical.com).
 * One Medical uses email/password login (not the MyChart two-step flow).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { type BrowserProvider } from "../browser/interface.js";
import { type ObserveResult } from "../browser/interface.js";
import { clearSession, saveSession, loadSavedSession } from "../session.js";
import { type AuthModule, type AuthConfig } from "./interface.js";

const OUTPUT_BASE = path.join(import.meta.dirname, "..", "..", "output");

/** Return the output dir for a provider. Falls back to base output dir. */
function resolveOutputDir(providerId?: string): string {
  return providerId ? path.join(OUTPUT_BASE, providerId) : OUTPUT_BASE;
}

function isAuthPage(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("/login") ||
    u.includes("/sign-in") ||
    u.includes("/signin") ||
    u.includes("/auth") ||
    u.includes("authentication") ||
    u.includes("twofactor") ||
    u.includes("verif")
  );
}

async function prompt(message: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return await rl.question(message);
  } finally {
    rl.close();
  }
}

async function doLogin(
  browser: BrowserProvider,
  debugUrl: string | null,
  credentials?: { username?: string; password?: string },
  providerId?: string,
): Promise<void> {
  const email =
    credentials?.username ??
    process.env.ONEMEDICAL_EMAIL ??
    (await prompt("   Enter One Medical email: "));
  const password =
    credentials?.password ??
    process.env.ONEMEDICAL_PASSWORD ??
    (await prompt("   Enter One Medical password: "));
  console.log();

  console.log("Step 4: Filling in One Medical login form...");

  // One Medical uses a single-page email + password form
  await browser.act(`Type "${email}" into the email input field`);
  console.log("   Email entered.");

  await browser.act(`Type "${password}" into the password input field`);
  console.log("   Password entered.");

  await browser.act(
    "Click the Sign In, Log In, or Submit button to submit the login form",
  );
  console.log("   Login form submitted.");
  console.log();

  await new Promise((r) => setTimeout(r, 3000));

  // Check for 2FA / MFA prompt
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

    // File-based 2FA relay -- same mechanism as MyChart
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
      try {
        fs.unlinkSync(codeFile);
      } catch {}

      const watcher = fs.watch(outputDir, (_event, filename) => {
        if (filename === "2fa.code" && fs.existsSync(codeFile)) {
          clearTimeout(timeout);
          watcher.close();
          resolve(fs.readFileSync(codeFile, "utf8").trim());
        }
      });

      // Also poll every 10s as a fallback (fs.watch can be unreliable)
      const poll = setInterval(() => {
        if (fs.existsSync(codeFile)) {
          clearTimeout(timeout);
          clearInterval(poll);
          watcher.close();
          resolve(fs.readFileSync(codeFile, "utf8").trim());
        }
      }, 10_000);
    });

    try {
      fs.unlinkSync(codeFile);
    } catch {}
    try {
      fs.unlinkSync(neededFile);
    } catch {}

    if (code) {
      console.log(`   Got code: ${code}`);
      await browser.act(
        `Type "${code}" into the verification code or security code input field`,
      );
      console.log("   Code entered.");
      await browser.act(
        "Click the Submit, Verify, or Continue button to submit the verification code",
      );
      console.log("   Submitted.");
    } else {
      console.log(
        "   No code received. Continuing to poll for browser-based entry...",
      );
    }

    console.log();
    console.log("   Waiting for login to complete...");
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
      throw new Error(
        "Timed out waiting for One Medical login to complete after 2FA.",
      );
    }
    console.log(`2FA completed -- logged in! URL: ${await browser.url()}`);
  } else {
    // No 2FA -- check if we landed on a dashboard
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
}

async function ensureLoggedIn(
  browser: BrowserProvider,
  loginUrl: string,
  credentials?: { username?: string; password?: string },
  providerId?: string,
): Promise<void> {
  // Navigate to saved home URL to verify session is still alive
  const savedSession = loadSavedSession(providerId);
  const homeUrl = savedSession?.homeUrl;
  if (homeUrl) {
    await browser.navigate(homeUrl);
    await new Promise((r) => setTimeout(r, 2000));
  }
  const currentUrl = await browser.url();
  if (!isAuthPage(currentUrl)) return;

  console.log(`   Session expired -- on auth page: ${currentUrl}`);
  console.log("   Re-authenticating...");
  clearSession(providerId);
  await browser.navigate(loginUrl);
  await new Promise((r) => setTimeout(r, 2000));
  await doLogin(browser, null, credentials, providerId);
  if (browser.saveSession) {
    const session = await browser.saveSession();
    session.homeUrl = await browser.url();
    saveSession(session, providerId);
    console.log("   Session re-saved.");
  }
}

// ---------------------------------------------------------------------------
// AuthModule implementation
// ---------------------------------------------------------------------------

/**
 * One Medical auth module implementing the pluggable AuthModule interface.
 */
export const oneMedicalAuth: AuthModule = {
  async login(browser, config, debugUrl) {
    await doLogin(browser, debugUrl, config.credentials, config.providerId);
  },

  async ensureLoggedIn(browser, config) {
    await ensureLoggedIn(browser, config.url, config.credentials, config.providerId);
  },
};
