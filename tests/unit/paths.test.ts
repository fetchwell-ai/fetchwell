/**
 * Unit tests for src/paths.ts — getOutputBase and getOutputDir.
 *
 * Validates the resolution order: explicit basePath > OUTPUT_DIR env var > default.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'node:path';

describe('getOutputBase', () => {
  const originalOutputDir = process.env.OUTPUT_DIR;

  afterEach(() => {
    // Restore env after each test
    if (originalOutputDir === undefined) {
      delete process.env.OUTPUT_DIR;
    } else {
      process.env.OUTPUT_DIR = originalOutputDir;
    }
  });

  it('returns the explicit basePath when provided', async () => {
    const { getOutputBase } = await import('../../src/paths.js');
    const result = getOutputBase('/custom/download/folder');
    expect(result).toBe('/custom/download/folder');
  });

  it('returns OUTPUT_DIR env var when no basePath provided', async () => {
    process.env.OUTPUT_DIR = '/env/output/dir';
    // Re-import to pick up env change (the module reads process.env at call time)
    const { getOutputBase } = await import('../../src/paths.js');
    const result = getOutputBase();
    expect(result).toBe('/env/output/dir');
  });

  it('returns default project-root/output when neither basePath nor OUTPUT_DIR is set', async () => {
    delete process.env.OUTPUT_DIR;
    const { getOutputBase } = await import('../../src/paths.js');
    const result = getOutputBase();
    // Should resolve to <project-root>/output
    expect(path.isAbsolute(result)).toBe(true);
    expect(result).toMatch(/[/\\]output$/);
  });

  it('basePath takes precedence over OUTPUT_DIR env var', async () => {
    process.env.OUTPUT_DIR = '/env/output/dir';
    const { getOutputBase } = await import('../../src/paths.js');
    const result = getOutputBase('/explicit/path');
    expect(result).toBe('/explicit/path');
  });
});

describe('getOutputDir', () => {
  it('joins basePath with providerId', async () => {
    const { getOutputDir } = await import('../../src/paths.js');
    const result = getOutputDir('stanford', '/base/output');
    expect(result).toBe(path.join('/base/output', 'stanford'));
  });

  it('uses default output base when basePath is omitted', async () => {
    delete process.env.OUTPUT_DIR;
    const { getOutputDir } = await import('../../src/paths.js');
    const result = getOutputDir('stanford');
    expect(path.isAbsolute(result)).toBe(true);
    expect(result).toMatch(/[/\\]output[/\\]stanford$/);
  });
});
