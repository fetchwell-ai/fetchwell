import { type BrowserProvider } from "../browser/interface.js";

/**
 * Pluggable authentication module interface.
 *
 * Each health-portal type (mychart, etc.) implements this interface
 * so the extraction pipeline can authenticate without knowing
 * portal-specific login flows.
 */
export interface AuthModule {
  /**
   * Perform a full login flow: fill credentials, handle 2FA, wait
   * until the browser lands on a post-login page.
   */
  login(
    browser: BrowserProvider,
    config: AuthConfig,
  ): Promise<void>;

  /**
   * Verify the session is still alive. If expired, re-authenticate.
   * Call this before each extraction section to guard against
   * server-side session timeouts.
   */
  ensureLoggedIn(
    browser: BrowserProvider,
    config: AuthConfig,
  ): Promise<void>;
}

/**
 * Credentials and URL needed by an auth module.
 */
export interface AuthConfig {
  /** The portal login URL (e.g. MyChart login page). */
  url: string;
  /** Optional pre-filled credentials. When absent, modules may prompt stdin. */
  credentials?: { username?: string; password?: string };
  /** Provider ID used for provider-scoped output (session files, 2FA relay, etc.). */
  providerId?: string;
}
