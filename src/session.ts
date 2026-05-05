import * as fs from "node:fs";
import * as path from "node:path";
import { type SerializedSession } from "./browser/interface.js";

const OUTPUT_BASE = path.join(import.meta.dirname, "..", "output");

/** Return the session file path for a given provider. */
function sessionPath(providerId?: string): string {
  if (providerId) {
    return path.join(OUTPUT_BASE, providerId, "session.json");
  }
  // Legacy fallback — flat output/session.json
  return path.join(OUTPUT_BASE, "session.json");
}

export function loadSavedSession(providerId?: string): SerializedSession | null {
  const filePath = sessionPath(providerId);
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

export function saveSession(session: SerializedSession, providerId?: string): void {
  const filePath = sessionPath(providerId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
}

export function clearSession(providerId?: string): void {
  try { fs.unlinkSync(sessionPath(providerId)); } catch {}
}
