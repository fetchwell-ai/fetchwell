/**
 * Login form strategies.
 *
 * Each strategy fills in credentials on a portal's login page.
 * The registry is extensible: add a new key+function to support
 * a new login form pattern.
 */

import { type BrowserProvider } from "../../browser/interface.js";
import { prompt } from "../shared.js";
import {
  detectLoginFormType,
  loadDetectedLoginFormType,
  saveDetectedLoginFormType,
} from "../detect-login-form.js";

/**
 * A login form handler fills credentials into the browser.
 */
export type LoginFormHandler = (
  browser: BrowserProvider,
  credentials?: { username?: string; password?: string },
) => Promise<void>;

/**
 * Two-step login: username field -> click Next -> password field -> Sign In.
 * Used by UCSF MyChart, Stanford MyChart, and similar Epic portals.
 */
const twoStep: LoginFormHandler = async (browser, credentials) => {
  const username =
    credentials?.username ??
    (await prompt("   Enter username: "));
  const password =
    credentials?.password ??
    (await prompt("   Enter password: "));
  console.log();

  console.log("Step 4: Filling in login form...");
  console.log(`[login] URL: ${await browser.url()}`);
  await browser.act(`Type "${username}" into the username or email input field`);
  console.log("   Username entered.");

  await browser.act("Click the Next or Continue button to proceed to the password page");
  console.log(`[login] After Next. URL: ${await browser.url()}`);
  await new Promise((r) => setTimeout(r, 2000));

  await browser.act(`Type "${password}" into the password input field`);
  console.log("   Password entered.");

  await browser.act("Click the Sign In or Log In button to submit the login form");
  console.log(`[login] Form submitted. URL: ${await browser.url()}`);
  console.log();
};

/**
 * Single-page login: email + password on the same form -> Sign In.
 * Used by One Medical and similar portals.
 */
const singlePage: LoginFormHandler = async (browser, credentials) => {
  const email =
    credentials?.username ??
    (await prompt("   Enter email: "));
  const password =
    credentials?.password ??
    (await prompt("   Enter password: "));
  console.log();

  console.log("Step 4: Filling in login form...");
  await browser.act(`Type "${email}" into the email input field`);
  console.log("   Email entered.");

  await browser.act(`Type "${password}" into the password input field`);
  console.log("   Password entered.");

  await browser.act(
    "Click the Sign In, Log In, or Submit button to submit the login form",
  );
  console.log("   Login form submitted.");
  console.log();
};

/**
 * Registry of login form strategies.
 *
 * To add a new pattern, add a new key+function here.
 */
export const loginFormRegistry: Record<string, LoginFormHandler> = {
  "two-step": twoStep,
  "single-page": singlePage,
};

/**
 * Build an auto-detecting login form handler for a given provider.
 *
 * On first login, uses browser.observe() to detect whether the form is
 * single-page or two-step, saves the result to the provider's output
 * directory, and delegates to the appropriate concrete handler.
 *
 * On subsequent calls (within the same session or after a cache hit), the
 * cached value from the output directory is used so detection is skipped.
 */
function buildAutoHandler(providerId?: string): LoginFormHandler {
  return async (browser, credentials) => {
    // Check file-based cache first (written on previous runs)
    if (providerId) {
      const cached = loadDetectedLoginFormType(providerId);
      if (cached) {
        console.log(`   Login form: using cached detection result — ${cached}`);
        const cachedHandler = loginFormRegistry[cached];
        if (cachedHandler) {
          return cachedHandler(browser, credentials);
        }
      }
    }

    // No cache — detect from the current page
    console.log("   Login form: auto-detecting form type...");
    const detected = await detectLoginFormType(browser);

    // Persist for future runs
    if (providerId) {
      saveDetectedLoginFormType(providerId, detected);
      console.log(`   Login form: saved detected type '${detected}' to cache`);
    }

    const handler = loginFormRegistry[detected];
    return handler(browser, credentials);
  };
}

/**
 * Look up a login form handler by strategy name.
 *
 * Pass `providerId` when strategy is 'auto' so the detected type can be
 * cached and reused across runs.
 */
export function getLoginFormHandler(strategy: string, providerId?: string): LoginFormHandler {
  if (strategy === "auto") {
    return buildAutoHandler(providerId);
  }
  const handler = loginFormRegistry[strategy];
  if (!handler) {
    throw new Error(
      `No login form strategy "${strategy}". ` +
      `Available: ${Object.keys(loginFormRegistry).join(", ")}, auto`,
    );
  }
  return handler;
}
