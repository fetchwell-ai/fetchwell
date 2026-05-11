/**
 * Bundled API key module.
 *
 * The key is stored XOR-encoded against a random mask in a generated file
 * (electron/bundled-key.generated.ts) that is gitignored and produced at
 * build time by running `npx tsx scripts/encode-key.ts`.
 *
 * Obfuscation prevents `grep sk-ant-` from finding the key in the binary.
 * It is NOT a security boundary — rate limiting in the Anthropic console
 * is the real protection.
 */

let encoded: { mask: number[]; data: number[] } | null = null;

try {
  // Dynamic require so TypeScript does not fail when the file does not exist.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const generated = require('./bundled-key.generated') as { BUNDLED_KEY_MASK: number[]; BUNDLED_KEY_DATA: number[] };
  encoded = { mask: generated.BUNDLED_KEY_MASK, data: generated.BUNDLED_KEY_DATA };
} catch {
  // File does not exist (dev environment without a bundled key) — that's fine.
  encoded = null;
}

/**
 * Decode the XOR-obfuscated key and return it as a string.
 * Returns an empty string if no bundled key is present.
 */
export function getBundledApiKey(): string {
  if (!encoded) return '';
  const { mask, data } = encoded;
  const bytes = data.map((b, i) => b ^ mask[i % mask.length]);
  return Buffer.from(bytes).toString('utf8');
}

/**
 * Returns true if a bundled key was loaded (the generated file exists and
 * contains non-empty data).
 */
export function hasBundledApiKey(): boolean {
  return encoded !== null && encoded.data.length > 0;
}
