/**
 * Standalone 2FA relay helper.
 *
 * Run alongside spike.ts. Watches for output/2fa.needed, then polls Gmail
 * IMAP for the most recent MyChart verification code and writes it to
 * output/2fa.code so the spike's file relay picks it up automatically.
 *
 *   Usage:  pnpm tsx src/2fa-relay.ts &
 */

import dotenv from "dotenv";
dotenv.config({ override: true });
import { ImapFlow } from "imapflow";
import * as fs from "node:fs";
import * as path from "node:path";

const OUTPUT_DIR = path.join(import.meta.dirname, "..", "output");
const neededFile = path.join(OUTPUT_DIR, "2fa.needed");
const codeFile = path.join(OUTPUT_DIR, "2fa.code");

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  console.error("GMAIL_USER or GMAIL_APP_PASSWORD not set.");
  process.exit(1);
}

async function fetchLatestCode(): Promise<string | null> {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER!, pass: GMAIL_APP_PASSWORD! },
    logger: false,
  });

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");

    const all = await client.search({ all: true });
    // Check the last 20 messages, newest first
    for (const uid of [...all].slice(-20).reverse()) {
      const msg = await client.fetchOne(String(uid), { source: true, envelope: true });
      if (!msg?.source) continue;

      // Only emails from the last 5 minutes
      const emailDate = msg.envelope?.date ? new Date(msg.envelope.date) : null;
      if (emailDate && Date.now() - emailDate.getTime() > 5 * 60_000) continue;

      const raw = (msg.source as Buffer).toString("utf8");
      // Skip email headers to avoid matching routing IDs
      const bodyStart = raw.indexOf("\r\n\r\n");
      const body = bodyStart >= 0 ? raw.slice(bodyStart + 4) : raw;
      const contextMatch =
        body.match(/code[:\s]+(\d{6})/i) ??
        body.match(/verification code is:?\s*(\d{6})/i) ??
        body.match(/(\d{6})\s+This code will expire/i);
      const match = contextMatch ?? body.match(/(?<![0-9])(\d{6})(?![0-9])/);
      if (match) {
        const code = match[1];
        const subject = msg.envelope?.subject ?? "(no subject)";
        console.log(`[2fa-relay] Found code ${code} in email: "${subject}"`);
        await client.logout();
        return code;
      }
    }

    await client.logout();
    return null;
  } catch (err) {
    try { await (client as any).logout(); } catch {}
    console.error("[2fa-relay] IMAP error:", (err as Error).message);
    return null;
  }
}

async function waitForCode(): Promise<void> {
  console.log("[2fa-relay] Polling Gmail for code...");
  for (let attempt = 0; attempt < 24; attempt++) {
    const code = await fetchLatestCode();
    if (code) {
      fs.writeFileSync(codeFile, code);
      console.log(`[2fa-relay] Code ${code} written to output/2fa.code`);
      return;
    }
    console.log(`[2fa-relay] No recent code yet (attempt ${attempt + 1}/24), retrying in 5s...`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log("[2fa-relay] Gave up after 2 minutes without finding a code.");
}

console.log("[2fa-relay] Watching for 2FA prompt...");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Fire immediately if 2fa.needed already exists
if (fs.existsSync(neededFile)) {
  waitForCode();
} else {
  const watcher = fs.watch(OUTPUT_DIR, async (_event, filename) => {
    if (filename === "2fa.needed" && fs.existsSync(neededFile)) {
      watcher.close();
      console.log("[2fa-relay] 2fa.needed detected — waiting 2s for email to arrive...");
      await new Promise((r) => setTimeout(r, 2000));
      await waitForCode();
    }
  });

  // Poll fallback in case fs.watch misses the event
  const poll = setInterval(() => {
    if (fs.existsSync(neededFile)) {
      clearInterval(poll);
      watcher.close();
      console.log("[2fa-relay] 2fa.needed detected (poll) — fetching code...");
      waitForCode();
    }
  }, 2000);
}
