/**
 * Two-factor authentication strategies.
 *
 * Each strategy handles the 2FA challenge after the login form is submitted.
 * The registry is extensible: add a new key+function to support a new 2FA method.
 */

import { type BrowserProvider } from "../../browser/interface.js";
import {
  detect2FA,
  enterCodeInBrowser,
  fetchGmailVerificationCode,
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  waitForFileBasedCode,
  waitForPostLoginNavigation,
  verifyLoginSuccess,
} from "../shared.js";

/**
 * A 2FA handler deals with the post-login 2FA challenge.
 * It should return once the browser is past the 2FA page.
 */
export type TwoFactorHandler = (
  browser: BrowserProvider,
  providerId?: string,
) => Promise<void>;

/**
 * No 2FA: just verify login succeeded.
 */
const none: TwoFactorHandler = async (browser) => {
  await verifyLoginSuccess(browser);
};

/**
 * Email 2FA: try Gmail IMAP auto-fetch first, fall back to file-based relay.
 */
const email: TwoFactorHandler = async (browser, providerId) => {
  await new Promise((r) => setTimeout(r, 3000));

  console.log("Step 5: Checking for 2FA/verification prompt...");
  const twoFaObservations = await detect2FA(browser);

  if (twoFaObservations.length > 0) {
    console.log("2FA/MFA detected!");

    // Try to select email delivery
    try {
      await browser.act(
        "If there is a choice between SMS/phone and email for the verification code, " +
        "click 'Send to my email' or the email option",
      );
      console.log("   Selected email delivery for 2FA code.");
      await new Promise((r) => setTimeout(r, 2000));
    } catch {
      // No delivery choice -- already showing code input
    }

    console.log();
    let enteredCode = false;

    if (GMAIL_USER && GMAIL_APP_PASSWORD) {
      console.log("   Fetching verification code from Gmail...");
      const code = await fetchGmailVerificationCode();
      if (code) {
        await enterCodeInBrowser(browser, code);
        enteredCode = true;
      } else {
        console.log("   Could not find code in Gmail. Falling back to file-based entry...");
      }
    }

    if (!enteredCode) {
      const code = await waitForFileBasedCode(providerId);
      if (code) {
        await enterCodeInBrowser(browser, code);
      } else {
        console.log("   No code received. Continuing to poll for browser-based entry...");
      }
    }

    await waitForPostLoginNavigation(browser);
  } else {
    await verifyLoginSuccess(browser);
  }
};

/**
 * Manual 2FA: file-based relay only (echo code > output/<provider>/2fa.code).
 */
const manual: TwoFactorHandler = async (browser, providerId) => {
  await new Promise((r) => setTimeout(r, 3000));

  console.log("Step 5: Checking for 2FA/verification prompt...");
  const twoFaObservations = await detect2FA(browser);

  if (twoFaObservations.length > 0) {
    console.log("2FA/MFA detected!");

    const code = await waitForFileBasedCode(providerId);
    if (code) {
      await enterCodeInBrowser(browser, code);
    } else {
      console.log("   No code received. Continuing to poll for browser-based entry...");
    }

    await waitForPostLoginNavigation(browser);
  } else {
    await verifyLoginSuccess(browser);
  }
};

/**
 * Registry of 2FA strategies.
 *
 * To add a new method, add a new key+function here.
 */
export const twoFactorRegistry: Record<string, TwoFactorHandler> = {
  none,
  email,
  manual,
};

/**
 * Look up a 2FA handler by strategy name.
 */
export function getTwoFactorHandler(strategy: string): TwoFactorHandler {
  const handler = twoFactorRegistry[strategy];
  if (!handler) {
    throw new Error(
      `No 2FA strategy "${strategy}". ` +
      `Available: ${Object.keys(twoFactorRegistry).join(", ")}`,
    );
  }
  return handler;
}
