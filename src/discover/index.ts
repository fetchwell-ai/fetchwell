/**
 * Portal Structure Discovery Engine
 *
 * Agentic loop: for each target section, navigate home and call browser.act()
 * with a natural language instruction, then verify with browser.extract().
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { type BrowserProvider } from "../browser/interface.js";
import { type NavMap, NAV_MAP_VERSION, saveNavMap } from "./nav-map.js";
import { OUTPUT_BASE } from "../extract/helpers.js";
import { type StructuredProgressEvent } from "../progress-events.js";
import {
  type SectionKey,
  SECTION_INSTRUCTIONS,
  VERIFY_INSTRUCTIONS,
  buildListInstruction,
  buildItemInstruction,
} from "../prompts.js";

// Re-export for backward compatibility (tests and helpers import from here)
export { type SectionKey, SECTION_INSTRUCTIONS, VERIFY_INSTRUCTIONS, buildListInstruction, buildItemInstruction };

/** Optional callback for emitting structured progress events. */
type ProgressEmitter = (event: StructuredProgressEvent) => void;

const VerifySchema = z.object({
  description: z.string().describe("Brief explanation of what you see on this page and why it does or does not match the expected section"),
  isCorrectPage: z.boolean().describe("True only if this page is actively showing the expected section content (e.g. a list of lab results, visits, medications, or messages)"),
});

// ---------------------------------------------------------------------------
// Discovery engine
// ---------------------------------------------------------------------------

/**
 * Discover the portal's navigation structure and build a NavMap.
 *
 * Assumes the browser is already logged in and on the post-login dashboard.
 */
export async function discoverPortal(
  browser: BrowserProvider,
  providerId: string,
  homeUrl: string,
  emitProgress?: ProgressEmitter,
): Promise<NavMap> {
  const emit = (event: StructuredProgressEvent) => { if (emitProgress) emitProgress(event); };
  const discoverDir = path.join(OUTPUT_BASE, providerId, "discover");
  fs.mkdirSync(discoverDir, { recursive: true });

  console.log("[discover] Starting agentic section finder...");
  console.log(`[discover] Home URL: ${homeUrl}`);

  await browser.navigate(homeUrl);
  await new Promise((r) => setTimeout(r, 3000));

  const dashSs = await browser.screenshot();
  fs.writeFileSync(path.join(discoverDir, "dashboard.png"), Buffer.from(dashSs, "base64"));
  console.log("[discover] Dashboard screenshot saved");

  const portalName = await browser.title();
  const sections: NavMap["sections"] = {};
  const allSections: SectionKey[] = ["labs", "visits", "medications", "messages"];

  for (const section of allSections) {
    emit({ type: 'status-message', phase: 'navigate', message: `Looking for ${section}...` });
    console.log();
    console.log(`[discover] Searching for "${section}"...`);

    let found = false;
    const instructions = SECTION_INSTRUCTIONS[section];

    for (let attempt = 0; attempt < instructions.length; attempt++) {
      const actInstruction = instructions[attempt];

      await browser.navigate(homeUrl);
      await new Promise((r) => setTimeout(r, 2000));

      console.log(`[discover]   Attempt ${attempt + 1}: acting...`);
      try {
        await browser.act(actInstruction);
      } catch (err: unknown) {
        console.log(`[discover]   act() failed: ${(err instanceof Error ? err.message : String(err)).slice(0, 100)}`);
        continue;
      }
      await new Promise((r) => setTimeout(r, 3000));

      let verification: { isCorrectPage: boolean; description: string };
      try {
        verification = await browser.extract(VerifySchema, VERIFY_INSTRUCTIONS[section]);
      } catch (err: unknown) {
        console.log(`[discover]   extract() failed: ${(err instanceof Error ? err.message : String(err)).slice(0, 100)}`);
        continue;
      }

      console.log(`[discover]   Verified: ${verification.isCorrectPage} — ${verification.description.slice(0, 100)}`);

      if (verification.isCorrectPage) {
        emit({ type: 'status-message', phase: 'navigate', message: `Mapping ${section}...` });
        const currentUrl = await browser.url();
        sections[section] = {
          steps: [actInstruction],
          url: currentUrl,
          listInstruction: buildListInstruction(section),
          itemInstruction: buildItemInstruction(section),
        };
        console.log(`[discover]   Found ${section} at: ${currentUrl}`);
        found = true;
        const ss = await browser.screenshot();
        fs.writeFileSync(path.join(discoverDir, `${section}.png`), Buffer.from(ss, "base64"));
        break;
      }
    }

    if (!found) {
      console.log(`[discover]   Could not find "${section}" after ${instructions.length} attempt(s).`);
      try {
        const ss = await browser.screenshot();
        fs.writeFileSync(path.join(discoverDir, `${section}-notfound.png`), Buffer.from(ss, "base64"));
      } catch { /* ignore */ }
    }
  }

  const navMap: NavMap = {
    version: NAV_MAP_VERSION,
    discoveredAt: new Date().toISOString(),
    portalName: portalName || providerId,
    sections,
  };

  saveNavMap(navMap, providerId);
  console.log();
  console.log(`[discover] Complete. Found ${Object.keys(sections).length}/4 sections:`);
  for (const [key, sec] of Object.entries(sections)) {
    console.log(`[discover]   ${key}: ${sec.steps.length} step(s) → ${sec.url ?? "no URL"}`);
  }
  const missing = allSections.filter((k) => !sections[k]);
  if (missing.length > 0) console.log(`[discover]   Missing: ${missing.join(", ")}`);

  return navMap;
}
