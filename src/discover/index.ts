/**
 * Portal Structure Discovery Engine
 *
 * Explores a health portal's navigation after login, uses AI (via observe/act)
 * to identify extraction-relevant sections (labs, visits, medications, messages),
 * and builds a NavMap recording the navigation steps to reach each section.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { type BrowserProvider, type ObserveResult } from "../browser/interface.js";
import { type NavMap, saveNavMap } from "./nav-map.js";
import { OUTPUT_BASE } from "../extract/helpers.js";
import { type StructuredProgressEvent } from "../progress-events.js";

/** Optional callback for emitting structured progress events. */
type ProgressEmitter = (event: StructuredProgressEvent) => void;

// ---------------------------------------------------------------------------
// Keyword mapping: extraction target -> words the AI might use to describe it
// ---------------------------------------------------------------------------

const SECTION_KEYWORDS: Record<string, string[]> = {
  labs: ["test results", "labs", "lab results", "results", "laboratory", "imaging", "radiology", "diagnostics", "pathology"],
  visits: [
    "visits", "appointments", "past visits", "after visit summary", "after-visit summary",
    "office visits", "encounter", "avs", "notes", "visit summaries", "visit summary",
    "care plan", "care summary", "clinical notes", "clinical summary",
  ],
  medications: ["medications", "medicines", "prescriptions", "medication list", "pharmacy", "drugs", "rx", "current medications", "active medications"],
  messages: ["messages", "inbox", "message center", "messaging", "secure messages", "compose", "conversations"],
};

type SectionKey = "labs" | "visits" | "medications" | "messages";

/**
 * Match a page description (from observe()) against our known extraction targets.
 * Returns the section key if matched, or null.
 *
 * Uses word-boundary matching to avoid false positives like "welcome message"
 * matching the "messages" section. Also skips dashboard/home pages.
 */
function matchSection(description: string): SectionKey | null {
  const lower = description.toLowerCase();

  // Dashboard/home pages should never match a section
  const dashboardIndicators = [
    "good morning", "good afternoon", "good evening",
    "welcome back", "welcome,", "dashboard",
  ];
  if (dashboardIndicators.some((d) => lower.includes(d))) {
    return null;
  }

  // Score each section by how many keywords match (word-boundary aware)
  let bestSection: SectionKey | null = null;
  let bestCount = 0;

  for (const [section, keywords] of Object.entries(SECTION_KEYWORDS)) {
    const count = keywords.filter((kw) => {
      // Use word-boundary regex to avoid partial matches
      // e.g. "message" in "welcome message" should NOT match "messages"
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`\\b${escaped}\\b`, "i");
      return re.test(lower);
    }).length;
    if (count > bestCount) {
      bestCount = count;
      bestSection = section as SectionKey;
    }
  }

  return bestSection;
}

/**
 * Build an observe() instruction for listing items within a matched section.
 */
function buildListInstruction(section: SectionKey): string {
  switch (section) {
    case "labs":
      return (
        "Find all clickable lab result or test result entries on this page. " +
        "Each entry is a row or link representing a specific lab panel or test result " +
        "(e.g. CBC, MRI, Lipid Panel). Return each one as a separate result."
      );
    case "visits":
      return (
        "Find all clickable visit entries on this page. " +
        "Each entry is a row or link representing a specific past visit, appointment, " +
        "or after-visit summary. Return each one as a separate result."
      );
    case "medications":
      return (
        "Find the medication list on this page. Look for a table or list of " +
        "current medications, prescriptions, or medicines."
      );
    case "messages":
      return (
        "Find all clickable message threads on this page. " +
        "Each entry is a row or link representing a message thread or conversation. " +
        "Return each one as a separate result."
      );
  }
}

/**
 * Build an observe() instruction for drilling into individual items.
 */
function buildItemInstruction(section: SectionKey): string {
  switch (section) {
    case "labs":
      return (
        "Find the detailed lab result content on this page — the result values, " +
        "reference ranges, and any associated notes or comments."
      );
    case "visits":
      return (
        "Find the visit detail content on this page — the visit summary, " +
        "notes, diagnoses, instructions, and any attached documents."
      );
    case "medications":
      return (
        "Find the medication detail — dosage, frequency, prescribing provider, " +
        "pharmacy, and refill information."
      );
    case "messages":
      return (
        "Find the message thread content — all messages in the conversation, " +
        "sender names, dates, and message bodies."
      );
  }
}

// ---------------------------------------------------------------------------
// Discovery engine
// ---------------------------------------------------------------------------

/**
 * Discover the portal's navigation structure and build a NavMap.
 *
 * Assumes the browser is already logged in and on the post-login dashboard.
 *
 * @param browser       - A logged-in BrowserProvider instance
 * @param providerId    - The provider ID (e.g. "ucsf") for output paths
 * @param homeUrl       - The post-login dashboard URL
 * @param emitProgress  - Optional callback for structured progress events
 * @returns The discovered NavMap
 */
export async function discoverPortal(
  browser: BrowserProvider,
  providerId: string,
  homeUrl: string,
  emitProgress?: ProgressEmitter,
): Promise<NavMap> {
  const emit = (event: StructuredProgressEvent) => {
    if (emitProgress) emitProgress(event);
  };
  const discoverDir = path.join(OUTPUT_BASE, providerId, "discover");
  fs.mkdirSync(discoverDir, { recursive: true });

  console.log("Discovery: starting portal navigation exploration...");
  console.log(`   Home URL: ${homeUrl}`);

  // Step 1: Navigate to home/dashboard
  await browser.navigate(homeUrl);
  await new Promise((r) => setTimeout(r, 3000));

  // Step 2: Observe all navigation elements on the dashboard
  console.log("Discovery: observing dashboard navigation elements...");
  const navElements = await browser.observe(
    "List all navigation elements visible on this page — top navigation bar items, " +
    "sidebar links, hamburger menu items, tab labels. For each, return its visible text " +
    "label and what kind of navigation element it is.",
  );

  console.log(`Discovery: found ${navElements.length} navigation element(s)`);
  for (const el of navElements) {
    console.log(`   - ${el.description}`);
  }

  // Take a screenshot of the dashboard
  const dashSs = await browser.screenshot();
  fs.writeFileSync(path.join(discoverDir, "dashboard.png"), Buffer.from(dashSs, "base64"));
  console.log("Discovery: dashboard screenshot saved");

  // Get the portal name from the page title
  const portalName = await browser.title();

  // Step 3: Click through each nav element and classify the page
  const sections: NavMap["sections"] = {};
  const visited = new Set<SectionKey>();

  for (const navEl of navElements) {
    // Skip nav elements that are clearly not health-record sections
    const lowerDesc = navEl.description.toLowerCase();
    const skipPatterns = [
      "log out", "logout", "sign out", "signout",
      "home", "dashboard",
      "profile", "account", "settings", "preferences",
      "help", "support", "contact",
      "billing", "payment", "insurance",
      "proxy", "family", "dependents",
      "share access", "personalize", "security", "verification",
    ];
    if (skipPatterns.some((p) => lowerDesc.includes(p))) {
      console.log(`Discovery: skipping "${navEl.description}" (not a health record section)`);
      continue;
    }

    // All 4 sections found — stop exploring
    if (visited.size === 4) break;

    emit({ type: 'status-message', phase: 'navigate', message: `Looking for ${navEl.description.toLowerCase()}...` });
    console.log(`Discovery: exploring "${navEl.description}"...`);

    // Navigate back to home first to have a clean starting point
    await browser.navigate(homeUrl);
    await new Promise((r) => setTimeout(r, 2000));

    // Click the nav element
    const actInstruction = `Click the navigation element labeled "${navEl.description}"`;
    try {
      await browser.act(actInstruction);
    } catch (err: any) {
      console.log(`   Failed to click "${navEl.description}": ${err?.message?.slice(0, 80)}`);
      continue;
    }
    await new Promise((r) => setTimeout(r, 3000));

    // Observe what kind of page this is — focus on main content, not nav elements
    const pageObs = await browser.observe(
      "Look at the MAIN CONTENT AREA of this page (not the navigation bar or sidebar). " +
      "What is the page heading or title? What kind of content is displayed — " +
      "test results/labs, visit records/appointments, medication list/prescriptions, " +
      "message inbox/threads, or something else (settings, profile, billing, etc.)? " +
      "Describe only what the main content shows, not what navigation links are visible.",
    );

    const pageDescription = pageObs.map((o) => o.description).join(" ");
    console.log(`   Page description: ${pageDescription.slice(0, 120)}`);

    // Take a screenshot
    const sectionSs = await browser.screenshot();
    const screenshotName = navEl.description.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + ".png";
    fs.writeFileSync(path.join(discoverDir, screenshotName), Buffer.from(sectionSs, "base64"));

    // Observe sub-navigation items (sidebar, sub-tabs, etc.)
    const subNavObs = await browser.observe(
      "List any sub-navigation tabs, sub-tabs, sidebar links, or secondary navigation items " +
      "on this page. Include items in left sidebars, sub-menus, or content tabs. " +
      "For each, return its visible text label.",
    );

    if (subNavObs.length > 0) {
      console.log(`   Found ${subNavObs.length} sub-nav item(s):`);
      for (const sub of subNavObs) {
        console.log(`      - ${sub.description}`);
      }
    }

    // Match the page description to an extraction target
    const matched = matchSection(pageDescription);

    if (matched && !visited.has(matched)) {
      emit({ type: 'status-message', phase: 'navigate', message: `Mapping ${matched}...` });
      console.log(`   Matched extraction target: ${matched}`);
      visited.add(matched);

      const steps = [actInstruction];

      // For sections with sub-tabs, explore one level deeper
      const relevantSubTab = findRelevantSubTab(subNavObs, matched);
      if (relevantSubTab) {
        console.log(`   Clicking sub-tab: "${relevantSubTab.description}"`);
        const subActInstruction = `Click the sub-tab or secondary navigation item labeled "${relevantSubTab.description}"`;
        try {
          await browser.act(subActInstruction);
          await new Promise((r) => setTimeout(r, 2000));
          steps.push(subActInstruction);

          const subSs = await browser.screenshot();
          fs.writeFileSync(path.join(discoverDir, matched + "-subtab.png"), Buffer.from(subSs, "base64"));
        } catch (err: any) {
          console.log(`   Failed to click sub-tab: ${err?.message?.slice(0, 80)}`);
        }
      }

      sections[matched] = {
        steps,
        listInstruction: buildListInstruction(matched),
        itemInstruction: buildItemInstruction(matched),
      };
      console.log(`   Recorded ${matched} section with ${steps.length} step(s)`);
    } else if (matched && visited.has(matched)) {
      console.log(`   Matched "${matched}" but already found — skipping`);
    } else {
      console.log(`   No extraction target matched from page description`);
    }

    // Check sub-nav items for sections we haven't found yet.
    // A single nav element (like a hamburger menu) may contain sub-items
    // for multiple sections (e.g. "Test Results", "Medicines", "Messages").
    for (const subItem of subNavObs) {
      if (visited.size === 4) break;

      const subMatch = matchSection(subItem.description);
      if (!subMatch || visited.has(subMatch)) continue;

      console.log(`   Sub-nav item "${subItem.description}" matches unfound section: ${subMatch}`);
      console.log(`   Exploring sub-nav item...`);

      // Navigate back to home, re-click the parent nav element, then click the sub-item
      await browser.navigate(homeUrl);
      await new Promise((r) => setTimeout(r, 2000));

      try {
        await browser.act(actInstruction);
        await new Promise((r) => setTimeout(r, 2000));
      } catch (err: any) {
        console.log(`   Failed to re-click parent nav: ${err?.message?.slice(0, 80)}`);
        continue;
      }

      const subActInstruction = `Click the navigation item or sidebar link labeled "${subItem.description}"`;
      try {
        await browser.act(subActInstruction);
      } catch (err: any) {
        console.log(`   Failed to click sub-item "${subItem.description}": ${err?.message?.slice(0, 80)}`);
        continue;
      }
      await new Promise((r) => setTimeout(r, 3000));

      visited.add(subMatch);
      const subSteps = [actInstruction, subActInstruction];

      // Check for relevant sub-tabs within this section too
      const innerSubNavObs = await browser.observe(
        "List any sub-navigation tabs or secondary navigation items on this page.",
      );
      const innerRelevantSubTab = findRelevantSubTab(innerSubNavObs, subMatch);
      if (innerRelevantSubTab) {
        console.log(`   Clicking inner sub-tab: "${innerRelevantSubTab.description}"`);
        const innerSubAct = `Click the sub-tab or secondary navigation item labeled "${innerRelevantSubTab.description}"`;
        try {
          await browser.act(innerSubAct);
          await new Promise((r) => setTimeout(r, 2000));
          subSteps.push(innerSubAct);
        } catch (err: any) {
          console.log(`   Failed to click inner sub-tab: ${err?.message?.slice(0, 80)}`);
        }
      }

      // Take a screenshot
      const subSs = await browser.screenshot();
      fs.writeFileSync(path.join(discoverDir, subMatch + ".png"), Buffer.from(subSs, "base64"));

      sections[subMatch] = {
        steps: subSteps,
        listInstruction: buildListInstruction(subMatch),
        itemInstruction: buildItemInstruction(subMatch),
      };
      console.log(`   Recorded ${subMatch} section with ${subSteps.length} step(s)`);
    }
  }

  // Build the NavMap
  const navMap: NavMap = {
    discoveredAt: new Date().toISOString(),
    portalName: portalName || providerId,
    sections,
  };

  // Step 6: Save the nav-map
  saveNavMap(navMap, providerId);
  console.log();
  console.log(`Discovery complete. Found ${Object.keys(sections).length}/4 sections:`);
  for (const [key, sec] of Object.entries(sections)) {
    console.log(`   ${key}: ${sec.steps.length} navigation step(s)`);
  }
  const missing = (["labs", "visits", "medications", "messages"] as const).filter(
    (k) => !sections[k],
  );
  if (missing.length > 0) {
    console.log(`   Missing: ${missing.join(", ")}`);
  }

  return navMap;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Given sub-navigation observations, find the most relevant one for a section.
 * For visits, look for "past", "notes", "AVS", "documents".
 * For labs, look for "results", "completed".
 * For messages, look for "inbox", "received".
 * For medications, look for "current medications", "active prescriptions".
 *
 * IMPORTANT: Keywords must be specific enough to not match unrelated items.
 * "current" alone matches "Current Health Issues" — use "current medications" instead.
 */
function findRelevantSubTab(
  subNavObs: ObserveResult[],
  section: SectionKey,
): ObserveResult | null {
  const relevanceKeywords: Record<SectionKey, string[]> = {
    labs: ["results", "completed", "past results", "all results", "all test", "lab results", "test results"],
    visits: ["past", "notes", "avs", "documents", "summary", "after visit", "completed", "visit summaries", "visit summary", "care summary"],
    medications: ["current medications", "active prescriptions", "current meds", "medications", "medicines"],
    messages: ["inbox", "received", "all messages", "sent", "conversations"],
  };

  const keywords = relevanceKeywords[section];

  for (const obs of subNavObs) {
    const lower = obs.description.toLowerCase();
    if (keywords.some((kw) => lower.includes(kw))) {
      return obs;
    }
  }

  return null;
}
