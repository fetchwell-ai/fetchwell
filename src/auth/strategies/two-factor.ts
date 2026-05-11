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

  const urlBefore2FA = await browser.url();
  console.log(`[2fa:ui] URL before 2FA check: ${urlBefore2FA}`);
  console.log("Step 5: Checking for 2FA/verification prompt...");
  const twoFaObservations = await detect2FA(browser);

  if (twoFaObservations.length > 0) {
    console.log("2FA/MFA detected!");
    console.log(`[2fa:ui] Observations: ${JSON.stringify(twoFaObservations.map(o => o.description ?? o))}`);

    if (!otpCallback) {
      throw new Error("No OTP callback registered for ui 2FA strategy");
    }

    // Try to select a delivery method and/or click "Send code" if the portal requires it.
    // Prefer SMS/text/phone over email (faster delivery, fewer spam-filter issues).
    let deliveryHint: string | undefined;
    try {
      const deliveryChoice = await browser.extract(
        z.object({
          hasDeliveryChoice: z.boolean(),
          hasSms: z.boolean(),
          hasEmail: z.boolean(),
          codeInputAlreadyVisible: z.boolean(),
        }),
        "Look at this page and determine: " +
        "(1) hasDeliveryChoice: is there a choice of how to receive a verification code (e.g. buttons or links for SMS, text, phone, email)? " +
        "(2) hasSms: is there an option for SMS, text message, or phone? " +
        "(3) hasEmail: is there an option for email? " +
        "(4) codeInputAlreadyVisible: is there already a code/OTP input field visible?",
      );

      console.log(`[2fa:ui] Delivery analysis: ${JSON.stringify(deliveryChoice)}`);

      if (deliveryChoice.codeInputAlreadyVisible && !deliveryChoice.hasDeliveryChoice) {
        console.log("   Code input already visible — no delivery button to click.");
      } else if (deliveryChoice.hasDeliveryChoice) {
        if (deliveryChoice.hasSms) {
          await browser.act(
            "Click the option to receive the verification code via SMS, text message, or phone. " +
            "Then click any 'Send', 'Send code', 'Continue', or similar button if present.",
          );
          deliveryHint = "text message";
          console.log(`[2fa:ui] Selected SMS/text. URL now: ${await browser.url()}`);
        } else if (deliveryChoice.hasEmail) {
          await browser.act(
            "Click the option to receive the verification code via email. " +
            "Then click any 'Send', 'Send code', 'Continue', or similar button if present.",
          );
          deliveryHint = "email";
          console.log(`[2fa:ui] Selected email. URL now: ${await browser.url()}`);
        } else {
          await browser.act(
            "Select any available option to receive the verification code, then click 'Send', 'Continue', or similar.",
          );
          console.log(`[2fa:ui] Selected fallback option. URL now: ${await browser.url()}`);
        }
        await new Promise((r) => setTimeout(r, 3000));
        console.log(`[2fa:ui] After delivery wait. URL: ${await browser.url()}`);
      } else {
        // No choice but might need to click a send button
        await browser.act(
          "If there is a 'Send code', 'Send', 'Continue', or similar button to trigger sending the verification code, click it.",
        );
        console.log(`[2fa:ui] Triggered send. URL now: ${await browser.url()}`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (err) {
      console.log(`[2fa:ui] Delivery selection failed: ${err instanceof Error ? err.message : err}`);
      console.log(`[2fa:ui] URL after failure: ${await browser.url()}`);
    }

    // Try to extract more specific delivery info from the confirmation text
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
      // Best-effort — keep whatever deliveryHint we already have
    }

    console.log(`[2fa:ui] Requesting code from user (hint: ${deliveryHint ?? 'none'})`);
    const code = await otpCallback(deliveryHint);
    if (code === null) {
      throw new Error("2FA code not provided — user may have timed out or cancelled");
    }

    console.log(`[2fa:ui] Got code, entering in browser. URL: ${await browser.url()}`);
    await enterCodeInBrowser(browser, code);
    console.log(`[2fa:ui] Code entered, waiting for post-login navigation...`);
    await waitForPostLoginNavigation(browser);
    console.log(`[2fa:ui] Post-login complete. URL: ${await browser.url()}`);
  } else {
    console.log(`[2fa:ui] No 2FA detected. URL: ${urlBefore2FA}`);
    await verifyLoginSuccess(browser);
    console.log(`[2fa:ui] Login verified. URL: ${await browser.url()}`);
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
