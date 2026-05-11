import * as fs from "node:fs";
import * as path from "node:path";
import { type BrowserProvider } from "../browser/interface.js";
import { ensureLoggedIn } from "../auth.js";
import {
  readDirSafe,
  makeItemFilename,
  mergePdfs,
  navigateWithRetry,
  navigateToSection,
  logDepth,
  shouldSkipIncremental,
} from "./helpers.js";
import { type StructuredProgressEvent } from "../progress-events.js";

/** Optional callback for emitting structured progress events. */
type ProgressEmitter = (event: StructuredProgressEvent) => void;

/**
 * Probe mode: navigate to messages inbox, observe threads, log count + titles,
 * take a screenshot. Does NOT extract any PDFs.
 */
export async function probeMessages(browser: BrowserProvider, portalUrl: string, probeDir: string, navNotes = "", credentials?: { username?: string; password?: string }, providerId?: string, authenticatedSelectors?: string[]): Promise<void> {
  console.log("[probe] Messages: navigating...");
  await ensureLoggedIn(browser, portalUrl, credentials, providerId, authenticatedSelectors);

  const fallbackAct = 'Click the Messages or Inbox link in the navigation menu. ' +
    'It may be labeled "Messages", "Inbox", or "MyChart Messages".';
  const defaultObserve = "Find all clickable message threads or conversations on this page. " +
    "Each entry is a row with a subject line, sender, and date. Return each one separately.";
  const { listInstruction } = await navigateToSection(browser, providerId, "messages", { act: fallbackAct }, portalUrl);
  await new Promise((r) => setTimeout(r, 3000));

  await logDepth(browser, "messages");

  const observeInstruction = listInstruction ?? defaultObserve;
  const threadLinks = await browser.observe(
    (navNotes ? navNotes + "\n\n" : "") + observeInstruction,
  );

  console.log(`[probe] Messages: ${threadLinks.length} thread(s) found`);
  threadLinks.slice(0, 5).forEach((link, i) => {
    console.log(`[probe]   ${i + 1}. ${link.description}`);
  });
  if (threadLinks.length > 5) {
    console.log(`[probe]   ... and ${threadLinks.length - 5} more`);
  }

  const ss = await browser.screenshot();
  fs.writeFileSync(path.join(probeDir, "messages.png"), Buffer.from(ss, "base64"));
  console.log(`[probe] Messages: screenshot saved to ${probeDir}/messages.png`);
}

/**
 * Returns the number of PDFs written in this run (0 if none extracted).
 * The caller should only record a timestamp in last-extracted.json when the count is > 0.
 */
export async function extractMessages(browser: BrowserProvider, portalUrl: string, navNotes = "", credentials?: { username?: string; password?: string }, outputDir?: string, providerId?: string, cutoff?: Date | null, incremental = false, authenticatedSelectors?: string[], emitProgress?: ProgressEmitter): Promise<number> {
  const emit = (event: StructuredProgressEvent) => {
    if (emitProgress) emitProgress(event);
  };
  const baseDir = outputDir ?? process.cwd();
  const msgsDir = path.join(baseDir, "messages");
  fs.mkdirSync(msgsDir, { recursive: true });

  // Clear dir for a forced full re-run; otherwise partial runs resume per-thread
  if (process.env.FORCE_MSGS === "1") {
    readDirSafe(msgsDir).forEach((f) => fs.unlinkSync(path.join(msgsDir, f)));
  }

  console.log("Step 9: Navigating to messages...");
  await ensureLoggedIn(browser, portalUrl, credentials, providerId, authenticatedSelectors);

  const fallbackAct = 'Click the Messages or Inbox link in the navigation menu. ' +
    'It may be labeled "Messages", "Inbox", or "MyChart Messages".';
  const defaultObserve = "Find all clickable message threads or conversations on this page. " +
    "Each entry is a row with a subject line, sender, and date. Return each one separately.";
  const { listInstruction, navigationFailed } = await navigateToSection(browser, providerId, "messages", { act: fallbackAct }, portalUrl);
  if (navigationFailed) {
    console.log("   Messages: navigation failed — skipping section.");
    return 0;
  }
  await new Promise((r) => setTimeout(r, 3000));

  await logDepth(browser, "messages");
  const observeInstruction = listInstruction ?? defaultObserve;
  const threadLinks = await browser.observe(
    (navNotes ? navNotes + "\n\n" : "") + observeInstruction,
  );
  console.log(`   Found ${threadLinks.length} message thread(s).`);
  if (threadLinks.length > 0) {
    emit({ type: 'status-message', phase: 'extract', message: `Found ${threadLinks.length} messages to fetch...` });
  }

  if (threadLinks.length === 0) {
    console.log("   No messages found — saving screenshot.");
    const ss = await browser.screenshot();
    fs.writeFileSync(path.join(msgsDir, "inbox.png"), Buffer.from(ss, "base64"));
    return 0;
  }

  const listUrl = await browser.url();
  const maxThreads = Math.min(threadLinks.length, 50);
  const savedFiles = readDirSafe(msgsDir);
  let extracted = 0;

  for (let i = 0; i < maxThreads; i++) {
    const link = threadLinks[i];
    const prefix = String(i + 1).padStart(3, "0") + "_";
    if (incremental && savedFiles.some((f) => f.startsWith(prefix) && f.endsWith(".pdf"))) {
      console.log(`   Thread ${i + 1}/${maxThreads}: already saved — skipping`);
      continue;
    }
    if (shouldSkipIncremental(link.description, cutoff ?? null)) {
      console.log(`   Thread ${i + 1}/${maxThreads}: before cutoff — skipping (${link.description})`);
      continue;
    }

    emit({ type: 'status-message', phase: 'extract', message: `Downloading message ${i + 1} of ${maxThreads}...` });
    console.log(`   Thread ${i + 1}/${maxThreads}: ${link.description}`);
    try {
      const urlBefore = await browser.url();
      await browser.act(`Click the element: ${link.description}`);
      await new Promise((r) => setTimeout(r, 1000));
      // If act() silently failed (shadow DOM element), fall back to direct selector click
      if ((await browser.url()) === urlBefore && browser.clickSelector && link.selector) {
        console.log(`      (act() didn't navigate — trying direct selector click)`);
        await browser.clickSelector(link.selector);
        await new Promise((r) => setTimeout(r, 1000));
      }
      try { await browser.waitFor({ type: "networkIdle" }); } catch {}

      const pageTitle = await browser.title();
      const filename = makeItemFilename(i, pageTitle || link.description, ".pdf", providerId);
      if (browser.pdf) {
        const pdfBuf = await browser.pdf();
        const msgLabel = pageTitle || link.description;
        emit({ type: 'status-message', phase: 'extract', message: `Downloading ${msgLabel.slice(0, 60)}...` });
        fs.writeFileSync(path.join(msgsDir, filename), pdfBuf);
        extracted++;
      }
      console.log(`      → saved ${filename}`);
    } catch (err: any) {
      console.log(`      → error: ${err?.message ?? err}`);
      try {
        const ss = await browser.screenshot();
        fs.writeFileSync(path.join(msgsDir, `thread-${i + 1}-error.png`), Buffer.from(ss, "base64"));
      } catch {}
    }
    await navigateWithRetry(browser, listUrl);
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`   Messages saved to ${msgsDir}`);
  const mergedFilename = providerId ? `messages-${providerId}.pdf` : "messages.pdf";
  await mergePdfs(msgsDir, path.join(baseDir, mergedFilename), "threads");
  return extracted;
}
