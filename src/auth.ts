/**
 * Backward-compatibility barrel.
 *
 * The auth implementation uses a composable strategy system:
 * - src/auth/shared.ts — shared utilities
 * - src/auth/strategies/login-form.ts — login form strategies
 * - src/auth/strategies/two-factor.ts — 2FA strategies
 * - src/auth/index.ts — composes strategies into AuthModule
 *
 * This file re-exports everything that was previously exported here
 * so existing imports like `import { ensureLoggedIn } from "../auth.js"`
 * continue to work unchanged.
 */

export {
  isAuthPage,
  checkAuthenticatedElement,
  prompt,
  waitForObservation,
  fetchGmailVerificationCode,
  ensureLoggedIn,
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
} from "./auth/shared.js";

// Also re-export the new pluggable interface and factory for consumers
// that want to use the auth module system.
export { type AuthModule, type AuthConfig, getAuthModule } from "./auth/index.js";

// ---------------------------------------------------------------------------
// Backward-compatible doLogin using default strategies (two-step + email).
// Matches the original MyChart auth behavior.
// ---------------------------------------------------------------------------

import { type BrowserProvider } from "./browser/interface.js";
import { getLoginFormHandler } from "./auth/strategies/login-form.js";
import { getTwoFactorHandler } from "./auth/strategies/two-factor.js";

export async function doLogin(
  browser: BrowserProvider,
  debugUrl: string | null,
  credentials?: { username?: string; password?: string },
  providerId?: string,
): Promise<void> {
  const loginHandler = getLoginFormHandler("two-step");
  const twoFactorHandler = getTwoFactorHandler("email");
  await loginHandler(browser, credentials);
  await twoFactorHandler(browser, providerId);
}
