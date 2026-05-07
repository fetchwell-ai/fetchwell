/**
 * Login form strategies.
 *
 * Each strategy fills in credentials on a portal's login page.
 * The registry is extensible: add a new key+function to support
 * a new login form pattern.
 */

import { type BrowserProvider } from "../../browser/interface.js";
import { prompt } from "../shared.js";

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
 * Look up a login form handler by strategy name.
 */
export function getLoginFormHandler(strategy: string): LoginFormHandler {
  const handler = loginFormRegistry[strategy];
  if (!handler) {
    throw new Error(
      `No login form strategy "${strategy}". ` +
      `Available: ${Object.keys(loginFormRegistry).join(", ")}`,
    );
  }
  return handler;
}
