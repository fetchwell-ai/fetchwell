import * as fs from "node:fs";
import * as path from "node:path";
import { type SerializedSession } from "./browser/interface.js";

const DEFAULT_OUTPUT_BASE = path.join(import.meta.dirname, "..", "output");

/**
 * Return the session file path for a given provider.
 *
 * If `basePath` is provided it is used as the parent output directory;
 * otherwise falls back to the dirname-relative default (CLI mode).
 */
function sessionPath(providerId?: string, basePath?: string): string {
  const base = basePath ?? DEFAULT_OUTPUT_BASE;
  if (providerId) {
    return path.join(base, providerId, "session.json");
  }
  // Legacy fallback — flat <base>/session.json
  return path.join(base, "session.json");
}

export function loadSavedSession(providerId?: string, basePath?: string): SerializedSession | null {
  const filePath = sessionPath(providerId, basePath);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as SerializedSession;
    const ageMs = Date.now() - new Date(data.savedAt).getTime();
    if (ageMs > 12 * 60 * 60 * 1000) {
      console.log("   Saved session expired (>12h). Will log in fresh.");
      fs.unlinkSync(filePath);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function saveSession(session: SerializedSession, providerId?: string, basePath?: string): void {
  const filePath = sessionPath(providerId, basePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
}

export function clearSession(providerId?: string, basePath?: string): void {
  try { fs.unlinkSync(sessionPath(providerId, basePath)); } catch {}
}
