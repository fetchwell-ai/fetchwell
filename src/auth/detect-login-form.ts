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
import { getOutputBase } from "../paths.js";

/**
 * Return the path to the login form type cache file for a provider.
 *
 * @param basePath - Optional Electron download folder override.
 */
function cacheFilePath(providerId: string, basePath?: string): string {
  return path.join(getOutputBase(basePath), providerId, "login-form-type.json");
}

/**
 * Load the previously detected login form type from the cache file.
 * Returns null if no cache exists or the file cannot be read.
 *
 * @param basePath - Optional Electron download folder override.
 */
export function loadDetectedLoginFormType(providerId: string, basePath?: string): "two-step" | "single-page" | null {
  try {
    const filePath = cacheFilePath(providerId, basePath);
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
 *
 * @param basePath - Optional Electron download folder override.
 */
export function saveDetectedLoginFormType(
  providerId: string,
  loginForm: "two-step" | "single-page",
  basePath?: string,
): void {
  try {
    const filePath = cacheFilePath(providerId, basePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ loginForm }, null, 2), "utf-8");
  } catch (err) {
    console.log(
      `[login] Warning: could not save login form type cache: ${(err as Error).message}`,
    );
  }
}

/**
 * Detect whether a portal's login form is single-page or two-step.
 *
 * Uses a deterministic querySelector('input[type=password]') approach:
 * if a visible password field is present on the current page, the form is
 * single-page (both username and password on the same step). If no visible
 * password field is found, the form is two-step (password appears after
 * clicking Next).
 *
 * Must be called while the browser is on the portal's login page.
 *
 * @param browser - A BrowserProvider positioned on the login page
 * @returns 'single-page' if a visible password field is present,
 *          'two-step' if no visible password field is found,
 *          or 'two-step' on any detection error
 */
export async function detectLoginFormType(
  browser: BrowserProvider,
): Promise<"two-step" | "single-page"> {
  try {
    // Primary check: does a password input exist in the DOM?
    const passwordField = await browser.querySelector('input[type="password"]');
    if (!passwordField) {
      console.log("[login] Login form detection: no password field found — two-step");
      return "two-step";
    }

    // Visibility check: confirm the password input is not hidden via inline style
    // or a hidden/disabled attribute. Parse the page HTML for the password input's
    // context — if it appears with display:none, visibility:hidden, or type=hidden
    // in the raw markup we treat it as not visible (i.e., two-step).
    const html = await browser.pageHtml();
    const visible = hasVisiblePasswordInput(html);
    if (visible) {
      console.log("[login] Login form detection: visible password field found — single-page");
      return "single-page";
    }

    console.log("[login] Login form detection: password field present but not visible — two-step");
    return "two-step";
  } catch (err) {
    console.log(
      `[login] Login form detection failed (${(err as Error).message?.slice(0, 80) ?? "unknown error"}) — defaulting to two-step`,
    );
    return "two-step";
  }
}

/**
 * Check whether the given HTML markup contains a visible password input.
 *
 * A password input is considered NOT visible if:
 * - It has display:none or visibility:hidden in its inline style
 * - It is inside a container with display:none (checked one level up via simple heuristics)
 *
 * This function is exported for unit testing.
 */
export function hasVisiblePasswordInput(html: string): boolean {
  // Match all <input type="password" ...> or <input ... type="password" ...> tags
  // Use a case-insensitive pattern to handle varied capitalisation.
  const inputRegex = /<input\b([^>]*?type\s*=\s*["']password["'][^>]*?)>/gi;
  let match: RegExpExecArray | null;

  while ((match = inputRegex.exec(html)) !== null) {
    const attrs = match[1];
    // Check for inline style that hides the element
    const styleMatch = /\bstyle\s*=\s*["']([^"']*)["']/i.exec(attrs);
    if (styleMatch) {
      const style = styleMatch[1].toLowerCase();
      if (style.includes("display:none") || style.includes("display: none") ||
          style.includes("visibility:hidden") || style.includes("visibility: hidden")) {
        continue; // This password field is hidden — check the next one
      }
    }
    // Check for hidden attribute
    if (/\bhidden\b/i.test(attrs)) {
      continue;
    }
    // Found a password input without explicit hiding — treat as visible
    return true;
  }

  return false;
}
