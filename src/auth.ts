/**
 * Backward-compatibility barrel.
 *
 * The auth implementation has moved to src/auth/mychart.ts with a
 * pluggable AuthModule interface (src/auth/interface.ts).
 *
 * This file re-exports everything that was previously exported here
 * so existing imports like `import { doLogin } from "../auth.js"`
 * continue to work unchanged.
 */

export {
  isAuthPage,
  prompt,
  waitForObservation,
  fetchGmailVerificationCode,
  doLogin,
  ensureLoggedIn,
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
} from "./auth/mychart.js";

// Also re-export the new pluggable interface and factory for consumers
// that want to use the auth module system.
export { type AuthModule, type AuthConfig, getAuthModule } from "./auth/index.js";
