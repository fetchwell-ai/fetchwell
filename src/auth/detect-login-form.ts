/**
 * Login form type auto-detection.
 *
 * Uses browser.observe() to check whether the portal login page shows both
 * username and password fields simultaneously (single-page) or only the
 * username field with the password on a separate page (two-step).
 *
 * Defaults to 'two-step' on detection failure — this is the most common
 * pattern for Epic MyChart portals.
 */

import { type BrowserProvider } from "../browser/interface.js";

/**
 * Detect whether a portal's login form is single-page or two-step.
 *
 * Must be called while the browser is on the portal's login page.
 *
 * @param browser - A BrowserProvider positioned on the login page
 * @returns 'single-page' if both username and password are visible together,
 *          'two-step' if only username is visible (password comes later),
 *          or 'two-step' on any detection error
 */
export async function detectLoginFormType(
  browser: BrowserProvider,
): Promise<"two-step" | "single-page"> {
  try {
    const observations = await browser.observe(
      "Look at the login form. Are both a username/email field AND a password field visible at the same time? " +
      "Or is only the username/email field visible (password comes on a separate page)?",
    );

    if (observations.length === 0) {
      console.log("   Login form detection: no observations returned — defaulting to two-step");
      return "two-step";
    }

    // Concatenate all observation descriptions for keyword analysis
    const combined = observations.map((o) => o.description).join(" ").toLowerCase();

    // Positive signals for single-page (both fields visible at once)
    const singlePageSignals = [
      "both",
      "password field",
      "password input",
      "two fields",
      "both fields",
      "email and password",
      "username and password",
      "same page",
      "same form",
      "simultaneously",
    ];

    // Positive signals for two-step (only username visible)
    const twoStepSignals = [
      "only username",
      "only email",
      "username only",
      "email only",
      "no password",
      "separate page",
      "next page",
      "next step",
      "password comes",
      "password field is not",
      "password is not visible",
      "username field only",
      "email field only",
    ];

    const singlePageScore = singlePageSignals.filter((s) => combined.includes(s)).length;
    const twoStepScore = twoStepSignals.filter((s) => combined.includes(s)).length;

    console.log(
      `   Login form detection: single-page signals=${singlePageScore}, two-step signals=${twoStepScore}`,
    );
    console.log(`   Observation: "${combined.slice(0, 200)}"`);

    // Only classify as single-page if there's clear positive evidence
    if (singlePageScore > twoStepScore && singlePageScore > 0) {
      console.log("   Detected: single-page login form");
      return "single-page";
    }

    // Default to two-step on ambiguity or when two-step signals dominate
    console.log("   Detected: two-step login form (or defaulting)");
    return "two-step";
  } catch (err) {
    console.log(
      `   Login form detection failed (${(err as Error).message?.slice(0, 80) ?? "unknown error"}) — defaulting to two-step`,
    );
    return "two-step";
  }
}
