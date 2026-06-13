/**
 * Agent-facing prompt strings for FetchWell's browser automation.
 *
 * All act(), observe(), and extract() instruction strings live here so that
 * natural-language config is visible and editable in one place, separate from
 * the orchestration logic that uses them.
 *
 * Grouped by concern:
 *   - PORTAL_CONTEXT / GUARDRAIL  — shared safety clauses
 *   - DISCOVER_PROMPTS            — discovery engine (src/discover/index.ts)
 *   - LABS_PROMPTS                — lab/test-result extraction
 *   - VISITS_PROMPTS              — past visits extraction
 *   - MEDICATIONS_PROMPTS         — medications extraction
 *   - MESSAGES_PROMPTS            — messages/inbox extraction
 */

// ---------------------------------------------------------------------------
// Shared safety clauses
// ---------------------------------------------------------------------------

/**
 * Appended to act() instructions to keep the agent within the patient portal
 * and away from destructive or public-facing actions.
 */
export const PORTAL_CONTEXT =
  "in this patient health portal. Look in navigation bars, hamburger/menu buttons, " +
  "sidebars, or card links. Do NOT click public hospital website navigation (Doctors, Clinics, About Us, etc.). " +
  "NEVER click Log Out, Sign Out, account settings, security settings, Compose Message, Send Message, " +
  "Request Refill, Schedule Appointment, or any button that submits a form or sends data — " +
  "only navigate to view existing records.";

/**
 * Short guardrail clause used in hamburger-menu fallback instructions.
 */
export const GUARDRAIL =
  "NEVER click Log Out, Sign Out, account settings, security settings, Compose Message, Send Message, " +
  "Request Refill, Schedule Appointment, or any button that submits a form or sends data — " +
  "only navigate to view existing records.";

/**
 * Clause appended to VERIFY_INSTRUCTIONS to reject non-target pages
 * (dashboards, settings, etc.) even when they look superficially related.
 */
const NOT_THESE =
  "Answer false if this is a dashboard, home page, settings page, or any other section. " +
  "Answer true if this is the correct section even if it is empty or shows a no-results message.";

// ---------------------------------------------------------------------------
// Discovery prompts (src/discover/index.ts)
// ---------------------------------------------------------------------------

export type SectionKey = "labs" | "visits" | "medications" | "messages";

/**
 * Two act() instructions per section: primary attempt, then hamburger-menu
 * fallback. Exported as SECTION_INSTRUCTIONS for backward compatibility with
 * existing imports.
 */
export const SECTION_INSTRUCTIONS: Record<SectionKey, [string, string]> = {
  labs: [
    `Find and navigate to the test results or lab results page ${PORTAL_CONTEXT} ` +
    "It may be called Test Results, Lab Results, Results, Diagnostics, Pathology, Imaging, or Radiology.",
    `Try opening the hamburger menu or any expandable sidebar to find Test Results, Lab Results, Results, Diagnostics, Pathology, Imaging, or Radiology. ${GUARDRAIL}`,
  ],
  visits: [
    `Find and navigate to the past visits or visit history page ${PORTAL_CONTEXT} ` +
    "It may be called Visits, Past Visits, After-Visit Summaries, Encounter History, or Office Visits. " +
    "If you land on a page that shows Upcoming appointments, look for and click a 'Past' or 'Past Visits' tab.",
    `Try opening the hamburger menu or any expandable sidebar to find Past Visits, After-Visit Summaries, or Encounter History. ` +
    `If you land on a page showing Upcoming appointments, click the Past tab. ${GUARDRAIL}`,
  ],
  medications: [
    `Find and navigate to the medications page ${PORTAL_CONTEXT} ` +
    "It may be called Medications, Medicines, Prescriptions, Pharmacy, Current Medications, or Active Medications.",
    `Try opening the hamburger menu or any expandable sidebar to find Medications, Medicines, Prescriptions, Pharmacy, or Current Medications. ${GUARDRAIL}`,
  ],
  messages: [
    `Find and navigate to the messages or inbox page ${PORTAL_CONTEXT} ` +
    "It may be called Messages, Inbox, Message Center, Secure Messages, or Conversations.",
    `Try opening the hamburger menu or any expandable sidebar to find Messages, Inbox, Message Center, Secure Messages, or Conversations. ${GUARDRAIL}`,
  ],
};

/**
 * extract() instructions used to verify that the agent has reached the
 * expected section page. Also used during resilient navigation (tier 1-3) in
 * src/extract/helpers.ts.
 */
export const VERIFY_INSTRUCTIONS: Record<SectionKey, string> = {
  labs: `Is this page showing a list of lab results or test results (or an empty lab results section)? It should display individual lab panels, blood work, imaging results, or diagnostic reports — or an empty/no-results state for that section. ${NOT_THESE}`,
  visits: `Is this page showing a list of past visits or after-visit summaries (or an empty past visits section)? It must show PAST visits or visit history — NOT upcoming appointments only. A page that shows only upcoming or future appointments is NOT correct. A page about scheduling or explaining video visits is NOT correct. ${NOT_THESE}`,
  medications: `Is this page showing a list of medications, prescriptions, or medicines (or an empty medications section)? It should display current medications or a medication list. ${NOT_THESE}`,
  messages: `Is this page showing a list of messages or an inbox (or an empty inbox)? It should display conversations or secure message threads with healthcare providers. ${NOT_THESE}`,
};

/**
 * observe() instruction to find all clickable list items on a section's list
 * page. Stored in the nav-map and used by extraction to find individual items.
 */
export function buildListInstruction(section: SectionKey): string {
  switch (section) {
    case "labs": return "Find all clickable lab result or test result entries on this page. Each entry is a row or link representing a specific lab panel or test result (e.g. CBC, MRI, Lipid Panel). Include the item's date exactly as shown. Return each one as a separate result.";
    case "visits": return "Find all clickable past visit rows on this page. Each entry is a row or link representing a specific past visit or after-visit summary. Include the visit date exactly as shown. Return each one as a separate result.";
    case "medications": return "Find the medication list on this page. Look for a table or list of current medications, prescriptions, or medicines.";
    case "messages": return "Find all clickable message threads on this page. Each entry is a row or link representing a message thread or conversation. Include the message date exactly as shown. Return each one as a separate result.";
  }
}

/**
 * observe() instruction for drilling into a specific item's detail page.
 */
export function buildItemInstruction(section: SectionKey): string {
  switch (section) {
    case "labs": return "Find the detailed lab result content on this page — the result values, reference ranges, and any associated notes or comments.";
    case "visits": return "Find the visit detail content on this page — the visit summary, notes, diagnoses, instructions, and any attached documents.";
    case "medications": return "Find the medication detail — dosage, frequency, prescribing provider, pharmacy, and refill information.";
    case "messages": return "Find the message thread content — all messages in the conversation, sender names, dates, and message bodies.";
  }
}

// ---------------------------------------------------------------------------
// Labs prompts (src/extract/labs.ts)
// ---------------------------------------------------------------------------

export const LABS_PROMPTS = {
  /**
   * act() fallback instruction used when no nav-map entry is available.
   * Keeps the agent on the portal and away from destructive actions.
   */
  fallbackAct:
    'Navigate to the Test Results or Lab Results section. Look for links or menu items ' +
    'labeled "Test Results", "Labs", "Lab Results", or similar. ' +
    'NEVER click Log Out, Sign Out, account settings, security settings, Compose Message, Send Message, ' +
    'Request Refill, Schedule Appointment, or any button that submits a form or sends data — ' +
    'only navigate to view existing records.',

  /**
   * observe() instruction used when no listInstruction is present in the
   * nav-map (e.g. first run before discovery).
   */
  defaultObserve:
    "Find all clickable lab result or test result entries on this page. " +
    "Each entry is a row or link representing a specific lab panel or test result (e.g. CBC, MRI, Lipid Panel). " +
    "Include the item's date exactly as shown. Return each one as a separate result.",
} as const;

// ---------------------------------------------------------------------------
// Visits prompts (src/extract/visits.ts)
// ---------------------------------------------------------------------------

export const VISITS_PROMPTS = {
  /**
   * act() fallback instruction for navigating to past visits.
   */
  fallbackAct:
    'Click the Visits or Past Visits link in the navigation menu. It may be labeled "Visits", ' +
    '"Past Visits", or "Appointments". If you land on a page showing Upcoming appointments, click the Past tab. ' +
    'It is usually in the top navigation bar or sidebar. ' +
    'NEVER click Log Out, Sign Out, account settings, security settings, Compose Message, Send Message, ' +
    'Request Refill, Schedule Appointment, or any button that submits a form or sends data — ' +
    'only navigate to view existing records.',

  /**
   * observe() instruction used when no listInstruction is in the nav-map.
   */
  defaultObserve:
    "Find all clickable past visit rows on this page. " +
    "Each entry is a row or link representing a specific past visit or after-visit summary. " +
    "Include the visit date exactly as shown. Return each one as a separate result.",
} as const;

// ---------------------------------------------------------------------------
// Medications prompts (src/extract/medications.ts)
// ---------------------------------------------------------------------------

export const MEDICATIONS_PROMPTS = {
  /**
   * act() fallback instruction for navigating to the medications page.
   */
  fallbackAct:
    'Click the Medications or Medicines link in the navigation menu, sidebar, or home page. ' +
    'Look for text that says "Medications", "Medicines", "My Medications", or "Medication List". ' +
    'It may be in a left sidebar under a Medical Record section. ' +
    'NEVER click Log Out, Sign Out, account settings, security settings, Compose Message, Send Message, ' +
    'Request Refill, Schedule Appointment, or any button that submits a form or sends data — ' +
    'only navigate to view existing records.',
} as const;

// ---------------------------------------------------------------------------
// Messages prompts (src/extract/messages.ts)
// ---------------------------------------------------------------------------

export const MESSAGES_PROMPTS = {
  /**
   * act() fallback instruction for navigating to the messages inbox.
   */
  fallbackAct:
    'Click the Messages or Inbox link in the navigation menu. ' +
    'It may be labeled "Messages", "Inbox", or "MyChart Messages". ' +
    'NEVER click Log Out, Sign Out, account settings, security settings, Compose Message, Send Message, ' +
    'Request Refill, Schedule Appointment, or any button that submits a form or sends data — ' +
    'only navigate to view existing records.',

  /**
   * observe() instruction used when no listInstruction is in the nav-map.
   */
  defaultObserve:
    "Find all clickable message threads or conversations on this page. " +
    "Each entry is a row with a subject line, sender, and date. Include the message date exactly as shown. Return each one separately.",
} as const;
