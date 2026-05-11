/**
 * Two-factor authentication strategies.
 *
 * Each strategy handles the 2FA challenge after the login form is submitted.
 * The registry is extensible: add a new key+function to support a new 2FA method.
 */

import { z } from "zod";
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
 * Module-level OTP callback for the "ui" 2FA strategy.
 * Injected at runtime by the pipeline bridge (e.g. Electron IPC).
 */
let otpCallback: ((deliveryHint?: string) => Promise<string | null>) | null = null;

/**
 * Set (or clear) the OTP callback used by the "ui" 2FA strategy.
 */
export function setOtpCallback(cb: ((deliveryHint?: string) => Promise<string | null>) | null): void {
  otpCallback = cb;
}

/**
 * UI 2FA: calls an injected callback to get the OTP instead of Gmail or file relay.
 * The callback is expected to be set by the Electron bridge before auth runs.
 */
const ui: TwoFactorHandler = async (browser) => {
  await new Promise((r) => setTimeout(r, 3000));

  console.log("Step 5: Checking for 2FA/verification prompt...");
  const twoFaObservations = await detect2FA(browser);

  if (twoFaObservations.length > 0) {
    console.log("2FA/MFA detected!");

    if (!otpCallback) {
      throw new Error("No OTP callback registered for ui 2FA strategy");
    }

    // Try to extract where the code was sent (e.g. "We sent a code to c***@gmail.com")
    let deliveryHint: string | undefined;
    try {
      const extracted = await browser.extract(
        z.object({ deliveryHint: z.string() }),
        "Find any text on this page that says where a verification code was sent — " +
        "for example an email address, phone number, or delivery method (email, SMS, text). " +
        "Return ONLY the relevant phrase like 'email to c***@gmail.com' or 'text to (***) ***-1234' " +
        "or 'email' or 'SMS'. If nothing found, return empty string.",
      );
      const hint = (extracted?.deliveryHint ?? '').trim();
      if (hint && hint.length > 0 && hint.length < 200) {
        deliveryHint = hint;
        console.log(`   2FA delivery hint: ${deliveryHint}`);
      }
    } catch {
      // Best-effort — proceed without hint
    }

    const code = await otpCallback(deliveryHint);
    if (code === null) {
      throw new Error("2FA code not provided — user may have timed out or cancelled");
    }

    await enterCodeInBrowser(browser, code);
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
  ui,
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
