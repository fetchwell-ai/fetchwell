/**
 * Composable auth module factory.
 *
 * Builds an AuthModule by composing a login-form strategy and a 2FA
 * strategy based on the provider's auth config. No per-portal module
 * files needed -- adding a new pattern requires only adding a function
 * to the appropriate strategy registry.
 */

export { type AuthModule, type AuthConfig } from "./interface.js";

import { type AuthModule } from "./interface.js";
import { type AuthSettings } from "../config.js";
import { ensureLoggedIn as sharedEnsureLoggedIn, registerLoginFn } from "./shared.js";
import { getLoginFormHandler } from "./strategies/login-form.js";
import { getTwoFactorHandler } from "./strategies/two-factor.js";

/**
 * Build an AuthModule by composing the login-form strategy and 2FA
 * strategy specified in the provider's auth settings.
 *
 * Also registers the composed login function so that the standalone
 * ensureLoggedIn() can re-authenticate when sessions expire mid-crawl.
 *
 * @param authSettings - The auth config from providers.json (loginForm + twoFactor).
 * @param providerId - Optional provider ID for registering the login function.
 * @returns A composed AuthModule that handles login and session verification.
 */
export function getAuthModule(authSettings: AuthSettings, providerId?: string): AuthModule {
  const loginHandler = getLoginFormHandler(authSettings.loginForm);
  const twoFactorHandler = getTwoFactorHandler(authSettings.twoFactor);

  /**
   * Full login flow: fill credentials via the login-form strategy,
   * then handle 2FA via the two-factor strategy.
   */
  async function doLogin(
    browser: Parameters<AuthModule["login"]>[0],
    debugUrl: string | null,
    credentials?: { username?: string; password?: string },
    pid?: string,
  ): Promise<void> {
    await loginHandler(browser, credentials);
    await twoFactorHandler(browser, pid);
  }

  // Register the login function so ensureLoggedIn() can find it
  if (providerId) {
    registerLoginFn(providerId, doLogin);
  }

  return {
    async login(browser, config, debugUrl) {
      await doLogin(browser, debugUrl, config.credentials, config.providerId);
    },

    async ensureLoggedIn(browser, config) {
      await sharedEnsureLoggedIn(
        browser,
        config.url,
        config.credentials,
        config.providerId,
      );
    },
  };
}
