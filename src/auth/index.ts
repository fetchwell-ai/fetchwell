/**
 * Auth module registry and factory.
 *
 * Exports getAuthModule(type) which returns the correct AuthModule
 * implementation for a given provider type (e.g. "mychart").
 *
 * Also re-exports the AuthModule interface and AuthConfig type for
 * consumers that need the types.
 */

export { type AuthModule, type AuthConfig } from "./interface.js";
export { myChartAuth } from "./mychart.js";

import { type AuthModule } from "./interface.js";
import { myChartAuth } from "./mychart.js";

const registry: Record<string, AuthModule> = {
  mychart: myChartAuth,
};

/**
 * Look up the auth module for a given provider type.
 *
 * @param type - The provider type string from ProviderConfig (e.g. "mychart").
 * @returns The matching AuthModule.
 * @throws If no auth module is registered for the given type.
 */
export function getAuthModule(type: string): AuthModule {
  const mod = registry[type];
  if (!mod) {
    throw new Error(
      `No auth module registered for provider type "${type}". ` +
      `Available types: ${Object.keys(registry).join(", ")}`,
    );
  }
  return mod;
}
