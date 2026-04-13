/**
 * MyChart Health Records — Interactive Chat
 *
 * Loads all extracted health records from output/ and starts a streaming
 * chat session with Claude Sonnet so you can ask questions about your records.
 *
 *   Usage:  pnpm chat
 *
 * The full content of every extracted document (labs, visits, medications,
 * messages) is loaded into the context window at startup.  Claude has access
 * to everything and can answer follow-up questions without re-reading files.
 *
 * Commands inside the chat:
 *   /summary   — re-print the opening summary
 *   /clear     — start a fresh conversation (records stay in context)
 *   /exit      — quit
 */

import dotenv from "dotenv";
dotenv.config({ override: true });

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

// ---------------------------------------------------------------------------
// ANSI colour helpers
// ---------------------------------------------------------------------------
const R = "\x1b[0m";   // reset
const B = "\x1b[1m";   // bold
const D = "\x1b[2m";   // dim
const C = "\x1b[36m";  // cyan
const G = "\x1b[32m";  // green
const Y = "\x1b[33m";  // yellow

const OUTPUT_DIR = path.join(import.meta.dirname, "..", "output");

// ---------------------------------------------------------------------------
// HTML → plain text (no extra dependencies)
// ---------------------------------------------------------------------------
function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|li|tr|td|section|article|header|footer)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Load all records from output/
// ---------------------------------------------------------------------------
interface SectionStats {
  name: string;
  count: number;
}

function loadRecords(): { context: string; stats: SectionStats[] } {
  const stats: SectionStats[] = [];
  let context = "";

  const sections: Array<{ label: string; subdir: string }> = [
    { label: "Lab Results & Imaging Reports", subdir: "labs" },
    { label: "Visit Summaries", subdir: "visits" },
    { label: "Medications", subdir: "medications" },
    { label: "Messages", subdir: "messages" },
  ];

  for (const { label, subdir } of sections) {
    const dir = path.join(OUTPUT_DIR, subdir);
    if (!fs.existsSync(dir)) continue;

    const allFiles = fs.readdirSync(dir);
    const htmlFiles = allFiles.filter((f) => f.endsWith(".html")).sort();
    const jsonFiles = allFiles.filter((f) => f.endsWith(".json") && f !== "index.json").sort();

    // Prefer HTML files (richer content); fall back to JSON if no HTML yet
    const files = htmlFiles.length > 0 ? htmlFiles : jsonFiles;
    if (files.length === 0) continue;

    context += `\n\n${"=".repeat(60)}\n## ${label.toUpperCase()} (${files.length} documents)\n${"=".repeat(60)}\n\n`;
    let count = 0;

    for (const f of files) {
      const filepath = path.join(dir, f);
      const ext = path.extname(f);
      const docName = f
        .replace(ext, "")
        .replace(/^\d+_/, "")
        .replace(/-/g, " ")
        .trim();

      try {
        const raw = fs.readFileSync(filepath, "utf8");
        const text = ext === ".html" ? htmlToText(raw) : JSON.stringify(JSON.parse(raw), null, 2);
        if (text.length < 20) continue; // skip empty/stub files

        context += `### ${docName}\n\n${text}\n\n---\n\n`;
        count++;
      } catch {
        // skip unreadable files silently
      }
    }

    stats.push({ name: label, count });
  }

  return { context, stats };
}

// ---------------------------------------------------------------------------
// Estimate rough token count (4 chars ≈ 1 token)
// ---------------------------------------------------------------------------
function estimateTokens(text: string): number {
  return Math.round(text.length / 4);
}

async function streamToStdout(stream: AsyncIterable<any>): Promise<string> {
  let text = "";
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      process.stdout.write(event.delta.text);
      text += event.delta.text;
    }
  }
  return text;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY in environment.");
    process.exit(1);
  }

  console.log(`\n${B}${C}MyChart Health Records — Interactive Chat${R}`);
  console.log(`${D}─────────────────────────────────────────${R}\n`);

  // Load records
  process.stdout.write("Loading health records from output/...");
  const { context, stats } = loadRecords();
  const totalDocs = stats.reduce((s, x) => s + x.count, 0);
  console.log(` ${G}done${R}`);

  if (totalDocs === 0) {
    console.error(
      "\nNo records found in output/. Run `pnpm spike` first to extract your health records.",
    );
    process.exit(1);
  }

  for (const { name, count } of stats) {
    console.log(`  ${D}•${R} ${name}: ${B}${count}${R} document${count !== 1 ? "s" : ""}`);
  }

  const systemPrompt =
    `You are a knowledgeable and helpful health records assistant. ` +
    `You have been given the complete extracted health records from MyChart. ` +
    `Your job is to help the patient understand their own records clearly and accurately.\n\n` +
    `Guidelines:\n` +
    `- Answer questions about the records factually and cite specific documents when relevant.\n` +
    `- When asked for a summary, organize by category (labs, visits, medications, messages).\n` +
    `- Flag anything that looks clinically notable (abnormal values, follow-up recommendations, etc.).\n` +
    `- If a question can't be answered from the available records, say so clearly.\n` +
    `- Use plain language — explain medical terminology when it appears.\n\n` +
    `Here are all the extracted health records:\n` +
    context;

  const estTokens = estimateTokens(systemPrompt);
  console.log(`\n${D}Context: ~${estTokens.toLocaleString()} tokens loaded into context${R}`);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  let messages: Anthropic.MessageParam[] = [];

  // Auto-generate opening summary
  console.log(`\n${B}${G}Generating summary of your records...${R}\n`);
  const SUMMARY_PROMPT =
    "Please give me a concise summary of these health records. Cover:\n" +
    "1. Recent lab results and any notable findings or abnormal values\n" +
    "2. Recent visits — what they were for and any key outcomes\n" +
    "3. Current medications\n" +
    "4. Any recurring themes in the messages (referrals, follow-ups, medication questions)\n" +
    "Keep it to 300-400 words.";

  messages.push({ role: "user", content: SUMMARY_PROMPT });
  process.stdout.write(`${C}`);

  const summaryText = await streamToStdout(client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  }));
  process.stdout.write(R + "\n");
  messages.push({ role: "assistant", content: summaryText });

  // Interactive chat loop
  console.log(
    `\n${D}─────────────────────────────────────────${R}\n` +
    `${D}Commands: /summary  /clear  /exit  (or Ctrl+C)${R}\n`,
  );

  const rl = readline.createInterface({ input, output });

  const handleSigint = () => {
    console.log(`\n${D}Goodbye.${R}\n`);
    rl.close();
    process.exit(0);
  };
  process.on("SIGINT", handleSigint);

  while (true) {
    let userInput: string;
    try {
      userInput = (await rl.question(`${B}${Y}You:${R} `)).trim();
    } catch {
      // Ctrl+D / EOF
      break;
    }

    if (!userInput) continue;

    if (userInput === "/exit" || userInput === "exit" || userInput === "quit") {
      break;
    }

    if (userInput === "/clear") {
      messages = [];
      console.log(`${D}Conversation cleared. Records still in context.${R}\n`);
      continue;
    }

    if (userInput === "/summary") {
      console.log(`\n${C}${summaryText}${R}\n`);
      continue;
    }

    messages.push({ role: "user", content: userInput });

    process.stdout.write(`\n${B}${C}Claude:${R} `);

    try {
      const assistantText = await streamToStdout(client.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        messages,
      }));
      process.stdout.write("\n\n");
      messages.push({ role: "assistant", content: assistantText });
    } catch (err: any) {
      console.error(`\n${Y}Error: ${err?.message ?? err}${R}\n`);
    }
  }

  rl.close();
  process.removeListener("SIGINT", handleSigint);
  console.log(`\n${D}Goodbye.${R}\n`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
