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
});

const ProvidersFileSchema = z.object({
  providers: z.array(ProviderConfigSchema).min(1, "At least one provider must be defined"),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

/**
 * Load and validate providers.json from the project root.
 *
 * Exits with a clear error if the file is missing or malformed.
 */
export function loadProviders(): ProviderConfig[] {
  const filePath = path.join(PROJECT_ROOT, "providers.json");

  if (!fs.existsSync(filePath)) {
    console.error("Missing providers.json in project root.");
    console.error("   Copy providers.example.json to providers.json and fill in your providers.");
    console.error("");
    console.error("   cp providers.example.json providers.json");
    process.exit(1);
  }

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    console.error(`Failed to read providers.json: ${(err as Error).message}`);
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`providers.json is not valid JSON: ${(err as Error).message}`);
    process.exit(1);
  }

  const result = ProvidersFileSchema.safeParse(parsed);
  if (!result.success) {
    console.error("providers.json has invalid schema:");
    for (const issue of result.error.issues) {
      console.error(`   ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
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
