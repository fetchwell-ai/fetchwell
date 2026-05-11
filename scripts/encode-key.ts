/**
 * Build helper: XOR-encode the Anthropic API key for bundling.
 *
 * Usage:
 *   BUNDLED_ANTHROPIC_KEY=sk-ant-... npx tsx scripts/encode-key.ts
 *
 * Or put BUNDLED_ANTHROPIC_KEY in your .env file:
 *   npx tsx scripts/encode-key.ts
 *
 * Writes electron/bundled-key.generated.ts with the encoded constants.
 * That file is gitignored and should be regenerated at build time.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Load .env if present
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const plaintext = process.env.BUNDLED_ANTHROPIC_KEY;
if (!plaintext) {
  console.error('Error: BUNDLED_ANTHROPIC_KEY environment variable is not set.');
  console.error('Set it in your .env file or pass it directly:');
  console.error('  BUNDLED_ANTHROPIC_KEY=sk-ant-... npx tsx scripts/encode-key.ts');
  process.exit(1);
}

// Generate a random 32-byte mask
const maskBytes = Array.from(crypto.randomBytes(32));

// XOR each byte of the plaintext key against the cycling mask
const keyBytes = Array.from(Buffer.from(plaintext, 'utf8'));
const dataBytes = keyBytes.map((b, i) => b ^ maskBytes[i % maskBytes.length]);

// Write the generated file
const outputPath = path.join(process.cwd(), 'electron', 'bundled-key.generated.ts');

const content = `// AUTO-GENERATED — do not edit. Run \`npx tsx scripts/encode-key.ts\` to regenerate.
// This file is gitignored. The encoded key is XOR-obfuscated (casual deterrent only).
export const BUNDLED_KEY_MASK: number[] = ${JSON.stringify(maskBytes)};
export const BUNDLED_KEY_DATA: number[] = ${JSON.stringify(dataBytes)};
`;

fs.writeFileSync(outputPath, content, 'utf-8');
console.log(`Encoded key written to: ${outputPath}`);
console.log(`Key length: ${keyBytes.length} bytes, mask length: ${maskBytes.length} bytes`);
