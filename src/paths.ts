/**
 * Central output-path helpers.
 *
 * Every module that needs a base output directory must import from here.
 * No module should derive its own OUTPUT_BASE — doing so causes Electron
 * packaged mode to write session / nav-map files inside the app bundle
 * (process.cwd() === '/') rather than in the user's download folder.
 *
 * Usage:
 *   import { getOutputBase, getOutputDir } from "../paths.js";
 *
 *   // CLI mode (no basePath): resolves to <project-root>/output/
 *   const base = getOutputBase();
 *
 *   // Electron mode: caller passes the user's configured download folder
 *   const base = getOutputBase(downloadFolder);
 */

import * as path from "node:path";
import * as process from "node:process";

/**
 * Return the base output directory.
 *
 * Resolution order (first wins):
 *   1. `basePath` argument — Electron mode passes the user's download folder.
 *   2. `OUTPUT_DIR` environment variable — CI / advanced CLI override.
 *   3. `<project-root>/output/` — default for CLI / development.
 *
 * The project root is the directory that contains `src/`, resolved from
 * `import.meta.dirname` so the path is stable regardless of `process.cwd()`.
 */
export function getOutputBase(basePath?: string): string {
  if (basePath) return basePath;
  if (process.env.OUTPUT_DIR) return process.env.OUTPUT_DIR;
  return path.resolve(import.meta.dirname, "..", "output");
}

/**
 * Return the provider-scoped output directory: `<base>/<providerId>/`.
 *
 * @param providerId - The provider identifier (e.g. "stanford").
 * @param basePath   - Optional Electron download folder override.
 */
export function getOutputDir(providerId: string, basePath?: string): string {
  return path.join(getOutputBase(basePath), providerId);
}
