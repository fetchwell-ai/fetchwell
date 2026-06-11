/**
 * Unit tests for the IPC hardening changes:
 * - UpdateSettingsSchema validation (downloadFolder absolute, apiKey sk-ant- prefix)
 * - runExtraction portalId validation
 * - openInFinder/revealInFinder path confinement logic
 * - Navigation guard logic (will-navigate blocks non-file: URLs)
 *
 * The IPC handlers cannot be invoked directly in unit tests (no running Electron app),
 * so we test the Zod schemas and path-confinement logic in isolation, matching the
 * exact constraints implemented in ipc-handlers.ts.
 */
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { z } from 'zod';

// ── Inline schemas matching ipc-handlers.ts ─────────────────────────────────

const UpdateSettingsSchema = z.object({
  downloadFolder: z.string().refine((v) => path.isAbsolute(v), {
    message: 'downloadFolder must be an absolute path',
  }).optional(),
  showBrowser: z.boolean().optional(),
  incrementalExtraction: z.boolean().optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
  apiKeySource: z.enum(['bundled', 'custom']).optional(),
  apiKey: z.string().regex(/^sk-ant-/, { message: 'apiKey must start with sk-ant-' }).optional(),
});

const RunExtractionPortalIdSchema = z.string().min(1, 'portalId must not be empty');

const PathSchema = z.string().min(1);

// ── Path confinement helper (mirrors ipc-handlers.ts) ───────────────────────

function isPathConfined(targetPath: string, downloadFolder: string): boolean {
  const normalizedPath = path.resolve(targetPath);
  const normalizedDownload = path.resolve(downloadFolder);
  return (
    normalizedPath.startsWith(normalizedDownload + path.sep) ||
    normalizedPath === normalizedDownload
  );
}

// ────────────────────────────────────────────────────────────────────────────

describe('UpdateSettingsSchema — downloadFolder validation', () => {
  it('accepts an absolute path', () => {
    const result = UpdateSettingsSchema.parse({ downloadFolder: '/Users/alice/Documents/HealthRecords' });
    expect(result.downloadFolder).toBe('/Users/alice/Documents/HealthRecords');
  });

  it('accepts omitted downloadFolder (optional)', () => {
    const result = UpdateSettingsSchema.parse({});
    expect(result.downloadFolder).toBeUndefined();
  });

  it('rejects a relative path', () => {
    expect(() =>
      UpdateSettingsSchema.parse({ downloadFolder: 'relative/path' }),
    ).toThrow(/absolute/i);
  });

  it('rejects an empty string for downloadFolder', () => {
    // Empty string is not absolute and fails refine
    expect(() =>
      UpdateSettingsSchema.parse({ downloadFolder: '' }),
    ).toThrow();
  });

  it('rejects a path starting with ./', () => {
    expect(() =>
      UpdateSettingsSchema.parse({ downloadFolder: './local' }),
    ).toThrow(/absolute/i);
  });

  it('rejects a path starting with ../', () => {
    expect(() =>
      UpdateSettingsSchema.parse({ downloadFolder: '../parent' }),
    ).toThrow(/absolute/i);
  });
});

describe('UpdateSettingsSchema — apiKey validation', () => {
  it('accepts a key starting with sk-ant-', () => {
    const result = UpdateSettingsSchema.parse({ apiKey: 'sk-ant-api03-abc123' });
    expect(result.apiKey).toBe('sk-ant-api03-abc123');
  });

  it('accepts omitted apiKey (optional)', () => {
    const result = UpdateSettingsSchema.parse({});
    expect(result.apiKey).toBeUndefined();
  });

  it('rejects a key not starting with sk-ant-', () => {
    expect(() =>
      UpdateSettingsSchema.parse({ apiKey: 'sk-openai-abc123' }),
    ).toThrow(/sk-ant-/i);
  });

  it('rejects an empty string apiKey', () => {
    expect(() =>
      UpdateSettingsSchema.parse({ apiKey: '' }),
    ).toThrow(/sk-ant-/i);
  });

  it('rejects a key with different prefix (sk-ant missing the prefix entirely)', () => {
    expect(() =>
      UpdateSettingsSchema.parse({ apiKey: 'Bearer token-here' }),
    ).toThrow(/sk-ant-/i);
  });
});

describe('UpdateSettingsSchema — other fields', () => {
  it('accepts all valid fields together', () => {
    const result = UpdateSettingsSchema.parse({
      downloadFolder: '/tmp/records',
      showBrowser: true,
      incrementalExtraction: false,
      theme: 'dark',
      apiKeySource: 'custom',
      apiKey: 'sk-ant-api03-xyz',
    });
    expect(result.showBrowser).toBe(true);
    expect(result.theme).toBe('dark');
    expect(result.apiKeySource).toBe('custom');
  });

  it('rejects an invalid theme value', () => {
    expect(() =>
      UpdateSettingsSchema.parse({ theme: 'solarized' }),
    ).toThrow();
  });

  it('rejects an invalid apiKeySource value', () => {
    expect(() =>
      UpdateSettingsSchema.parse({ apiKeySource: 'env' }),
    ).toThrow();
  });

  it('rejects non-boolean showBrowser', () => {
    expect(() =>
      UpdateSettingsSchema.parse({ showBrowser: 'yes' }),
    ).toThrow();
  });

  it('rejects non-object input entirely', () => {
    expect(() => UpdateSettingsSchema.parse(null)).toThrow();
    expect(() => UpdateSettingsSchema.parse('string')).toThrow();
  });
});

describe('runExtraction portalId validation', () => {
  it('accepts a non-empty string portalId', () => {
    const result = RunExtractionPortalIdSchema.parse('stanford-health');
    expect(result).toBe('stanford-health');
  });

  it('rejects an empty string portalId', () => {
    expect(() => RunExtractionPortalIdSchema.parse('')).toThrow(/empty/i);
  });

  it('rejects a non-string portalId', () => {
    expect(() => RunExtractionPortalIdSchema.parse(null)).toThrow();
    expect(() => RunExtractionPortalIdSchema.parse(42)).toThrow();
    expect(() => RunExtractionPortalIdSchema.parse(undefined)).toThrow();
  });
});

describe('openInFinder / revealInFinder — path type validation', () => {
  it('rejects empty string', () => {
    expect(() => PathSchema.parse('')).toThrow();
  });

  it('accepts a non-empty string path', () => {
    const result = PathSchema.parse('/tmp/some/path');
    expect(result).toBe('/tmp/some/path');
  });

  it('rejects non-string', () => {
    expect(() => PathSchema.parse(null)).toThrow();
    expect(() => PathSchema.parse(123)).toThrow();
  });
});

describe('path confinement — isPathConfined', () => {
  const downloadFolder = '/Users/alice/Documents/HealthRecords';

  it('allows exact download folder', () => {
    expect(isPathConfined(downloadFolder, downloadFolder)).toBe(true);
  });

  it('allows a direct subdirectory of download folder', () => {
    expect(isPathConfined('/Users/alice/Documents/HealthRecords/stanford', downloadFolder)).toBe(true);
  });

  it('allows a deep subdirectory', () => {
    expect(isPathConfined('/Users/alice/Documents/HealthRecords/stanford/labs', downloadFolder)).toBe(true);
  });

  it('rejects a path outside the download folder', () => {
    expect(isPathConfined('/Users/alice/Desktop', downloadFolder)).toBe(false);
  });

  it('rejects a path that merely starts with the download folder prefix (directory traversal)', () => {
    // /Users/alice/Documents/HealthRecordsEvil should not match /Users/alice/Documents/HealthRecords
    expect(isPathConfined('/Users/alice/Documents/HealthRecordsEvil', downloadFolder)).toBe(false);
  });

  it('rejects a path that traverses above the download folder via ..',  () => {
    const traversal = '/Users/alice/Documents/HealthRecords/../../../etc/passwd';
    expect(isPathConfined(traversal, downloadFolder)).toBe(false);
  });

  it('allows a path with redundant slashes that resolves inside download folder', () => {
    const redundant = '/Users/alice/Documents/HealthRecords//stanford';
    expect(isPathConfined(redundant, downloadFolder)).toBe(true);
  });
});

describe('will-navigate guard logic', () => {
  // The guard in main.ts: allow file: protocol, deny everything else
  function shouldAllow(navigationUrl: string): boolean {
    const parsed = new URL(navigationUrl);
    return parsed.protocol === 'file:';
  }

  it('allows file: URLs (local renderer)', () => {
    expect(shouldAllow('file:///Users/alice/dist-renderer/index.html')).toBe(true);
  });

  it('denies http: URLs', () => {
    expect(shouldAllow('http://example.com')).toBe(false);
  });

  it('denies https: URLs', () => {
    expect(shouldAllow('https://evil.example.com/phishing')).toBe(false);
  });

  it('denies data: URLs', () => {
    expect(shouldAllow('data:text/html,<h1>hello</h1>')).toBe(false);
  });

  it('denies blob: URLs', () => {
    expect(shouldAllow('blob:https://example.com/abc123')).toBe(false);
  });
});
