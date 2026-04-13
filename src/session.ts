import * as fs from "node:fs";
import * as path from "node:path";
import { type SerializedSession } from "./browser/interface.js";

const OUTPUT_DIR = path.join(import.meta.dirname, "..", "output");
export const SESSION_FILE = path.join(OUTPUT_DIR, "session.json");

export function loadSavedSession(): SerializedSession | null {
  try {
    const data = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8")) as SerializedSession;
    const ageMs = Date.now() - new Date(data.savedAt).getTime();
    if (ageMs > 12 * 60 * 60 * 1000) {
      console.log("   Saved session expired (>12h). Will log in fresh.");
      fs.unlinkSync(SESSION_FILE);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function saveSession(session: SerializedSession): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
}

export function clearSession(): void {
  try { fs.unlinkSync(SESSION_FILE); } catch {}
}
