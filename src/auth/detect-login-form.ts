/**
 * Login form type auto-detection.
 *
 * Uses browser.observe() to check whether the portal login page shows both
 * username and password fields simultaneously (single-page) or only the
 * username field with the password on a separate page (two-step).
 *
 * Defaults to 'two-step' on detection failure — this is the most common
 * pattern for Epic MyChart portals.
 *
 * Detected values are cached in output/<providerId>/login-form-type.json so
 * that subsequent runs skip detection entirely.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { type BrowserProvider } from "../browser/interface.js";

const OUTPUT_BASE = path.join(import.meta.dirname, "..", "..", "output");

/**
 * Return the path to the login form type cache file for a provider.
 */
function cacheFilePath(providerId: string): string {
  return path.join(OUTPUT_BASE, providerId, "login-form-type.json");
}

/**
 * Load the previously detected login form type from the cache file.
 * Returns null if no cache exists or the file cannot be read.
 */
export function loadDetectedLoginFormType(providerId: string): "two-step" | "single-page" | null {
  try {
    const filePath = cacheFilePath(providerId);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as { loginForm?: string };
    if (parsed.loginForm === "two-step" || parsed.loginForm === "single-page") {
      return parsed.loginForm;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save a detected login form type to the cache file so future runs skip detection.
 */
export function saveDetectedLoginFormType(
  providerId: string,
  loginForm: "two-step" | "single-page",
): void {
  try {
    const filePath = cacheFilePath(providerId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ loginForm }, null, 2), "utf-8");
  } catch (err) {
    console.log(
      `   Warning: could not save login form type cache: ${(err as Error).message}`,
    );
  }
}

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
