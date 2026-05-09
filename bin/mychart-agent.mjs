#!/usr/bin/env node

/**
 * mychart-agent — CLI binary for FetchWell
 *
 * Usage:
 *   mychart-agent fetch                   # Extract all records
 *   mychart-agent fetch --provider <id>   # Extract for a specific provider
 *   mychart-agent fetch --all             # Extract for all providers
 *   mychart-agent fetch --incremental     # Only fetch items newer than last run
 *
 * Subcommands:
 *   fetch    Run the full extraction pipeline (equivalent to pnpm extract)
 */

const [, , subcommand, ...rest] = process.argv;

if (!subcommand || subcommand === '--help' || subcommand === '-h') {
  console.log('Usage: mychart-agent <subcommand> [options]');
  console.log('');
  console.log('Subcommands:');
  console.log('  fetch    Extract health records from configured portals');
  console.log('');
  console.log('Options (for fetch):');
  console.log('  --provider <id>   Run against a specific provider');
  console.log('  --all             Run against all configured providers');
  console.log('  --incremental     Only fetch items newer than last run');
  console.log('');
  console.log('Environment variables:');
  console.log('  ANTHROPIC_API_KEY   Required for stagehand-local browser mode');
  console.log('  BROWSER_PROVIDER    Browser backend: stagehand-local (default) | local');
  console.log('  PROBE=1             Probe mode: screenshots only, no PDFs');
  process.exit(0);
}

if (subcommand !== 'fetch') {
  console.error(`Unknown subcommand: "${subcommand}"`);
  console.error('Run `mychart-agent --help` for usage.');
  process.exit(1);
}

// Re-construct argv so that src/extract/index.ts sees the remaining flags
// as if it were called directly (process.argv[0]=node, process.argv[1]=script).
process.argv = [process.argv[0], process.argv[1], ...rest];

// Resolve the extraction entry point relative to this file's location.
// This file lives at <repo>/bin/mychart-agent.mjs; index.ts compiles to
// <repo>/dist/extract/index.js, but we invoke it via tsx at runtime so
// the source .ts file is used directly.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

// Dynamically import the extraction pipeline entry point.
// tsx (if on PATH) or node with --import tsx/esm handles TypeScript.
// When installed globally via npm, the compiled JS lives at dist/extract/index.js.
// When run from the repo, tsx is available and src/extract/index.ts is used via
// the pnpm script wrapper. For the binary invoked directly we use the compiled output
// or fall back gracefully.
const distEntry = path.join(repoRoot, 'dist', 'extract', 'index.js');
const srcEntry = path.join(repoRoot, 'src', 'extract', 'index.ts');

import { existsSync } from 'node:fs';

let entryPoint;
if (existsSync(distEntry)) {
  entryPoint = distEntry;
} else if (existsSync(srcEntry)) {
  // Running from repo with tsx available — relaunch via tsx
  const { spawn } = await import('node:child_process');
  const tsx = path.join(repoRoot, 'node_modules', '.bin', 'tsx');
  const tsxBin = existsSync(tsx) ? tsx : 'tsx';
  const child = spawn(tsxBin, [srcEntry, ...rest], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', (err) => {
    console.error(`Failed to launch tsx: ${err.message}`);
    console.error('Make sure tsx is installed: npm install -g tsx');
    process.exit(1);
  });
  // Do not fall through — child process handles execution
  process.exitCode = 0;
} else {
  console.error('Could not find extraction pipeline entry point.');
  console.error(`Looked for:\n  ${distEntry}\n  ${srcEntry}`);
  process.exit(1);
}

if (entryPoint) {
  await import(entryPoint);
}
