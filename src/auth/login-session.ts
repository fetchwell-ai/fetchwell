/**
 * Shared login/session-restore helper.
 *
 * Consolidates the ~200 lines of duplicated login/session-restore logic that
 * previously appeared in:
 *   - src/extract/index.ts (extractProvider + probeProvider)
 *   - src/extract/runner.ts
 *   - src/discover/cli.ts
 *   - src/discover/runner.ts
 *
 * Each caller had the same pattern:
 *   load session → check expiry → navigate to home → verify auth →
 *   fallback to fresh login → save session → return homeUrl
 */

import { type BrowserProvider } from "../browser/interface.js";
import { type AuthModule } from "./interface.js";
import { isAuthPage, checkAuthenticatedElement } from "./shared.js";
import { loadSavedSession, saveSession, clearSession } from "../session.js";
import { type StructuredProgressEvent } from "../progress-events.js";

/** Optional callback for emitting structured progress events (Electron mode). */
export type ProgressEmitter = (event: StructuredProgressEvent) => void;

export interface LoginOrRestoreSessionOptions {
  /** The provider's login page URL. Used for fresh-login navigation. */
  portalUrl: string;

  /** Provider ID — used for session file scoping. */
  providerId: string;

  /**
   * Optional base output directory (Electron download folder).
   * Defaults to the CLI-mode output directory when omitted.
   */
  basePath?: string;

  /** The auth module that handles the full login flow (credentials + 2FA). */
  authModule: AuthModule;

  /** Optional pre-filled credentials. When omitted, the login form strategy prompts stdin. */
  credentials?: { username?: string; password?: string };

  /**
   * Optional CSS selectors for authenticated-only elements.
   * When provided, the helper performs a secondary DOM check after navigating to
   * the home URL to detect "silent unauthenticated" portals (those that return
   * HTTP 200 on the home URL regardless of session state).
   */
  authenticatedSelectors?: string[];

  /**
   * Optional progress emitter for structured events (Electron mode only).
   * When omitted, no events are emitted.
   */
  emitProgress?: ProgressEmitter;
}

/**
 * Login or restore a saved session for a provider.
 *
 * Attempts to restore a saved browser session. If no session exists or the
 * session has expired, falls back to a fresh login. Saves the new session
 * when login succeeds.
 *
 * @returns The authenticated dashboard URL (homeUrl). This is the post-login
 *   URL that extractors use for agentic navigation fallback. It is NOT the
 *   login URL — navigating to the login URL while authenticated triggers
 *   MyChart's ?action=logout behavior.
 */
export async function loginOrRestoreSession(
  browser: BrowserProvider,
  opts: LoginOrRestoreSessionOptions,
): Promise<string> {
  const { portalUrl, providerId, basePath, authModule, credentials, authenticatedSelectors, emitProgress } = opts;
  const emit = (event: StructuredProgressEvent) => { if (emitProgress) emitProgress(event); };
  const authConfig = { url: portalUrl, credentials, providerId };

  const savedSession = loadSavedSession(providerId, basePath);

  if (savedSession && browser.loadSession) {
    emit({ type: 'status-message', phase: 'login', message: 'Restoring saved session...' });
    console.log("Step 3: Restoring saved session...");
    await browser.loadSession(savedSession);

    // Navigate to the saved home URL — NOT the login URL.
    // Navigating to the login URL while already authenticated triggers ?action=logout
    // on MyChart portals.
    const verifyUrl = savedSession.homeUrl ?? portalUrl;
    await browser.navigate(verifyUrl);
    await new Promise((r) => setTimeout(r, 2000));

    const currentUrl = await browser.url();
    const onAuthPage = isAuthPage(currentUrl);
    const selectors = authenticatedSelectors ?? [];
    const hasAuthElement =
      onAuthPage || selectors.length === 0
        ? false
        : await checkAuthenticatedElement(browser, selectors);

    if (!onAuthPage && (selectors.length === 0 || hasAuthElement)) {
      console.log("   Session restored — skipping login and 2FA.");
      console.log();
      return currentUrl;
    }

    // Session is invalid — log why and fall through to fresh login
    if (onAuthPage) {
      console.log(`   Session expired — redirected to auth page: ${currentUrl}`);
    } else {
      console.log(`   Session validation failed — no authenticated elements found at ${currentUrl}`);
    }
    console.log("   Logging in fresh...");
    emit({ type: 'status-message', phase: 'login', message: 'Signing in...' });
    clearSession(providerId, basePath);
    console.log();
    console.log("Step 3: Login");
    await browser.navigate(portalUrl);
    await new Promise((r) => setTimeout(r, 2000));
    await authModule.login(browser, authConfig);
    const homeUrl = await browser.url();
    if (browser.saveSession) {
      const session = await browser.saveSession();
      session.homeUrl = homeUrl;
      saveSession(session, providerId, basePath);
      console.log(`   Session saved to output/${providerId}/session.json.`);
    }
    return homeUrl;
  }

  // No saved session — perform fresh login
  emit({ type: 'status-message', phase: 'login', message: 'Navigating to sign-in page...' });
  console.log("Step 3: Login");
  await browser.navigate(portalUrl);
  await new Promise((r) => setTimeout(r, 2000));
  emit({ type: 'status-message', phase: 'login', message: 'Signing in...' });
  await authModule.login(browser, authConfig);
  const homeUrl = await browser.url();
  if (browser.saveSession) {
    const session = await browser.saveSession();
    session.homeUrl = homeUrl;
    saveSession(session, providerId, basePath);
    console.log(`   Session saved to output/${providerId}/session.json (login + 2FA skipped next run).`);
  }
  return homeUrl;
}
