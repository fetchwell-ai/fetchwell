import * as fs from "node:fs";
import * as path from "node:path";
import { type BrowserProvider } from "../browser/interface.js";
import { ensureLoggedIn } from "../auth.js";
import {
  OUTPUT_DIR,
  readDirSafe,
  makeItemFilename,
  mergePdfs,
  navigateWithRetry,
} from "./helpers.js";

export async function extractMessages(browser: BrowserProvider, mychartUrl: string): Promise<void> {
  const msgsDir = path.join(OUTPUT_DIR, "messages");
  fs.mkdirSync(msgsDir, { recursive: true });

  // Clear dir for a forced full re-run; otherwise partial runs resume per-thread
  if (process.env.FORCE_MSGS === "1") {
    readDirSafe(msgsDir).forEach((f) => fs.unlinkSync(path.join(msgsDir, f)));
  }

  console.log("Step 9: Navigating to messages...");
  await ensureLoggedIn(browser, mychartUrl);
  await browser.act(
    'Click the Messages or Inbox link in the navigation menu. ' +
    'It may be labeled "Messages", "Inbox", or "MyChart Messages".',
  );
  await new Promise((r) => setTimeout(r, 3000));

  const threadLinks = await browser.observe(
    "Find all clickable message threads or conversations on this page. " +
    "Each entry is a row with a subject line, sender, and date. Return each one separately.",
  );
  console.log(`   Found ${threadLinks.length} message thread(s).`);

  if (threadLinks.length === 0) {
    console.log("   No messages found — saving screenshot.");
    const ss = await browser.screenshot();
    fs.writeFileSync(path.join(msgsDir, "inbox.png"), Buffer.from(ss, "base64"));
    return;
  }

  const listUrl = await browser.url();
  const maxThreads = Math.min(threadLinks.length, 50);
  const savedFiles = readDirSafe(msgsDir);

  for (let i = 0; i < maxThreads; i++) {
    const link = threadLinks[i];
    const prefix = String(i + 1).padStart(3, "0") + "_";
    if (savedFiles.some((f) => f.startsWith(prefix) && f.endsWith(".pdf"))) {
      console.log(`   Thread ${i + 1}/${maxThreads}: already saved — skipping`);
      continue;
    }

    console.log(`   Thread ${i + 1}/${maxThreads}: ${link.description}`);
    try {
      await browser.act(`Click the element: ${link.description}`);
      await new Promise((r) => setTimeout(r, 1000));
      try { await browser.waitFor({ type: "networkIdle" }); } catch {}

      const pageTitle = await browser.title();
      const filename = makeItemFilename(i, pageTitle || link.description);
      if (browser.pdf) {
        const pdfBuf = await browser.pdf();
        fs.writeFileSync(path.join(msgsDir, filename), pdfBuf);
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
  await mergePdfs(msgsDir, path.join(OUTPUT_DIR, "messages.pdf"), "threads");
}
