/**
 * Provider configuration loader.
 *
 * Reads providers.json from the project root, validates it with Zod,
 * and returns the array of provider configs.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";

const PROJECT_ROOT = path.join(import.meta.dirname, "..");

const AuthSchema = z.object({
  loginForm: z.enum(["two-step", "single-page"]).default("two-step"),
  twoFactor: z.enum(["none", "email", "manual"]).default("manual"),
});

export type AuthSettings = z.infer<typeof AuthSchema>;

const ProviderConfigSchema = z.object({
  id: z.string().min(1, "Provider id must not be empty"),
  name: z.string().min(1, "Provider name must not be empty"),
  type: z.string().min(1, "Provider type must not be empty (e.g. 'mychart')"),
  url: z.string().url("Provider url must be a valid URL"),
  username: z.string().optional(),
  password: z.string().optional(),
  auth: AuthSchema.default({ loginForm: "two-step", twoFactor: "manual" }),
  authenticatedSelectors: z.array(z.string()).optional(),
});

const ProvidersFileSchema = z.object({
  providers: z.array(ProviderConfigSchema).min(1, "At least one provider must be defined"),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

/**
 * Load and validate providers.json from the project root.
 *
 * Throws an error if the file is missing or malformed, so callers can catch it.
 * CLI entry points may catch and call process.exit; library callers may propagate.
 */
export function loadProviders(): ProviderConfig[] {
  const filePath = path.join(PROJECT_ROOT, "providers.json");

  if (!fs.existsSync(filePath)) {
    throw new Error(
      "Missing providers.json in project root.\n" +
      "   Copy providers.example.json to providers.json and fill in your providers.\n" +
      "\n" +
      "   cp providers.example.json providers.json",
    );
  }

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    throw new Error(`Failed to read providers.json: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`providers.json is not valid JSON: ${(err as Error).message}`);
  }

  const result = ProvidersFileSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `   ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`providers.json has invalid schema:\n${issues}`);
  }

  return result.data.providers;
}

/**
 * Find a provider by its id.
 *
 * Returns the matching ProviderConfig or null if not found.
 */
export function findProvider(providers: ProviderConfig[], id: string): ProviderConfig | null {
  return providers.find((p) => p.id === id) ?? null;
}
