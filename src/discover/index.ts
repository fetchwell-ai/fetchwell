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
import { type NavMap, saveNavMap } from "./nav-map.js";
import { OUTPUT_BASE } from "../extract/helpers.js";
import { type StructuredProgressEvent } from "../progress-events.js";

/** Optional callback for emitting structured progress events. */
type ProgressEmitter = (event: StructuredProgressEvent) => void;

type SectionKey = "labs" | "visits" | "medications" | "messages";

const PORTAL_CONTEXT =
  "in this patient health portal. Look in navigation bars, hamburger/menu buttons, " +
  "sidebars, or card links. Do NOT click public hospital website navigation (Doctors, Clinics, About Us, etc.).";

// Two act() instructions per section: primary attempt, then hamburger-menu fallback.
const SECTION_INSTRUCTIONS: Record<SectionKey, [string, string]> = {
  labs: [
    `Find and navigate to the test results or lab results page ${PORTAL_CONTEXT} ` +
    "It may be called Test Results, Lab Results, Results, My Medical Record, Diagnostics, Pathology, Imaging, or Radiology.",
    "Try opening the hamburger menu or any expandable sidebar to find Test Results, Lab Results, Results, Diagnostics, Pathology, Imaging, or My Medical Record.",
  ],
  visits: [
    `Find and navigate to the visits or appointments page ${PORTAL_CONTEXT} ` +
    "It may be called Visits, Appointments, Past Visits, After-Visit Summaries, Encounter History, or Office Visits.",
    "Try opening the hamburger menu or any expandable sidebar to find Visits, Appointments, Past Visits, After-Visit Summaries, or Encounter History.",
  ],
  medications: [
    `Find and navigate to the medications page ${PORTAL_CONTEXT} ` +
    "It may be called Medications, Medicines, Prescriptions, Pharmacy, Current Medications, or Active Medications.",
    "Try opening the hamburger menu or any expandable sidebar to find Medications, Medicines, Prescriptions, Pharmacy, or Current Medications.",
  ],
  messages: [
    `Find and navigate to the messages or inbox page ${PORTAL_CONTEXT} ` +
    "It may be called Messages, Inbox, Message Center, Secure Messages, or Conversations.",
    "Try opening the hamburger menu or any expandable sidebar to find Messages, Inbox, Message Center, Secure Messages, or Conversations.",
  ],
};

const NOT_THESE = "Answer false if this is a dashboard, home page, settings page, or any other section.";
const VERIFY_INSTRUCTIONS: Record<SectionKey, string> = {
  labs: `Is this page showing a list of lab results or test results? It should display individual lab panels, blood work, imaging results, or diagnostic reports. ${NOT_THESE}`,
  visits: `Is this page showing a list of past visits, appointments, or after-visit summaries? It should display individual visit or appointment records. ${NOT_THESE} A page about scheduling or explaining video visits is NOT correct.`,
  medications: `Is this page showing a list of medications, prescriptions, or medicines? It should display current medications or a medication list. ${NOT_THESE}`,
  messages: `Is this page showing a list of messages or an inbox? It should display conversations or secure message threads with healthcare providers. ${NOT_THESE}`,
};

const VerifySchema = z.object({ isCorrectPage: z.boolean(), description: z.string() });

// ---------------------------------------------------------------------------
// Instruction helpers (used downstream by extraction)
// ---------------------------------------------------------------------------

export function buildListInstruction(section: SectionKey): string {
  switch (section) {
    case "labs": return "Find all clickable lab result or test result entries on this page. Each entry is a row or link representing a specific lab panel or test result (e.g. CBC, MRI, Lipid Panel). Return each one as a separate result.";
    case "visits": return "Find all clickable visit entries on this page. Each entry is a row or link representing a specific past visit, appointment, or after-visit summary. Return each one as a separate result.";
    case "medications": return "Find the medication list on this page. Look for a table or list of current medications, prescriptions, or medicines.";
    case "messages": return "Find all clickable message threads on this page. Each entry is a row or link representing a message thread or conversation. Return each one as a separate result.";
  }
}

export function buildItemInstruction(section: SectionKey): string {
  switch (section) {
    case "labs": return "Find the detailed lab result content on this page — the result values, reference ranges, and any associated notes or comments.";
    case "visits": return "Find the visit detail content on this page — the visit summary, notes, diagnoses, instructions, and any attached documents.";
    case "medications": return "Find the medication detail — dosage, frequency, prescribing provider, pharmacy, and refill information.";
    case "messages": return "Find the message thread content — all messages in the conversation, sender names, dates, and message bodies.";
  }
}

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

  console.log("Discovery: starting agentic section finder...");
  console.log(`   Home URL: ${homeUrl}`);

  await browser.navigate(homeUrl);
  await new Promise((r) => setTimeout(r, 3000));

  const dashSs = await browser.screenshot();
  fs.writeFileSync(path.join(discoverDir, "dashboard.png"), Buffer.from(dashSs, "base64"));
  console.log("Discovery: dashboard screenshot saved");

  const portalName = await browser.title();
  const sections: NavMap["sections"] = {};
  const allSections: SectionKey[] = ["labs", "visits", "medications", "messages"];

  for (const section of allSections) {
    emit({ type: 'status-message', phase: 'navigate', message: `Looking for ${section}...` });
    console.log();
    console.log(`Discovery: searching for "${section}"...`);

    let found = false;
    const instructions = SECTION_INSTRUCTIONS[section];

    for (let attempt = 0; attempt < instructions.length; attempt++) {
      const actInstruction = instructions[attempt];

      await browser.navigate(homeUrl);
      await new Promise((r) => setTimeout(r, 2000));

      console.log(`   Attempt ${attempt + 1}: acting...`);
      try {
        await browser.act(actInstruction);
      } catch (err: any) {
        console.log(`   act() failed: ${err?.message?.slice(0, 100)}`);
        continue;
      }
      await new Promise((r) => setTimeout(r, 3000));

      let verification: { isCorrectPage: boolean; description: string };
      try {
        verification = await browser.extract(VerifySchema, VERIFY_INSTRUCTIONS[section]);
      } catch (err: any) {
        console.log(`   extract() failed: ${err?.message?.slice(0, 100)}`);
        continue;
      }

      console.log(`   Verified: ${verification.isCorrectPage} — ${verification.description.slice(0, 100)}`);

      if (verification.isCorrectPage) {
        emit({ type: 'status-message', phase: 'navigate', message: `Mapping ${section}...` });
        const currentUrl = await browser.url();
        sections[section] = {
          steps: [actInstruction],
          url: currentUrl,
          listInstruction: buildListInstruction(section),
          itemInstruction: buildItemInstruction(section),
        };
        console.log(`   Found ${section} at: ${currentUrl}`);
        found = true;
        const ss = await browser.screenshot();
        fs.writeFileSync(path.join(discoverDir, `${section}.png`), Buffer.from(ss, "base64"));
        break;
      }
    }

    if (!found) {
      console.log(`   Could not find "${section}" after ${instructions.length} attempt(s).`);
      try {
        const ss = await browser.screenshot();
        fs.writeFileSync(path.join(discoverDir, `${section}-notfound.png`), Buffer.from(ss, "base64"));
      } catch { /* ignore */ }
    }
  }

  const navMap: NavMap = {
    discoveredAt: new Date().toISOString(),
    portalName: portalName || providerId,
    sections,
  };

  saveNavMap(navMap, providerId);
  console.log();
  console.log(`Discovery complete. Found ${Object.keys(sections).length}/4 sections:`);
  for (const [key, sec] of Object.entries(sections)) {
    console.log(`   ${key}: ${sec.steps.length} step(s) → ${sec.url ?? "no URL"}`);
  }
  const missing = allSections.filter((k) => !sections[k]);
  if (missing.length > 0) console.log(`   Missing: ${missing.join(", ")}`);

  return navMap;
}
