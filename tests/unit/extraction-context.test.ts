/**
 * Unit tests for ExtractionContext interface.
 *
 * Validates that the interface fields are correctly typed and that
 * the extraction functions accept an ExtractionContext object.
 * Uses type-level checks so no real browser I/O is needed.
 */

import { describe, it, expect } from 'vitest';
import { type ExtractionContext } from '../../src/extract/context.js';
import { type BrowserProvider } from '../../src/browser/interface.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal stub that satisfies BrowserProvider for type-checking purposes. */
function makeBrowser(): BrowserProvider {
  return {
    navigate: async () => {},
    act: async () => {},
    extract: async () => ({}) as never,
    observe: async () => [],
    screenshot: async () => '',
    fill: async () => {},
    waitFor: async () => {},
    getDebugUrl: async () => null,
    url: async () => 'https://portal.example.com',
    title: async () => 'Portal',
    querySelector: async () => null,
    pageText: async () => '',
    pageHtml: async () => '',
    close: async () => {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExtractionContext', () => {
  it('accepts a minimal context with only required fields', () => {
    const ctx: ExtractionContext = {
      browser: makeBrowser(),
      portalUrl: 'https://portal.example.com',
    };
    expect(ctx.portalUrl).toBe('https://portal.example.com');
    expect(ctx.browser).toBeDefined();
  });

  it('accepts all optional fields', () => {
    const cutoff = new Date('2024-01-01');
    const emitProgress = () => {};

    const ctx: ExtractionContext = {
      browser: makeBrowser(),
      portalUrl: 'https://portal.example.com',
      navNotes: 'Navigate to labs via sidebar',
      credentials: { username: 'user@example.com', password: 'secret' },
      outputDir: '/tmp/output/my-provider',
      providerId: 'my-provider',
      cutoff,
      incremental: true,
      authenticatedSelectors: ['.user-menu', '#dashboard'],
      emitProgress,
    };

    expect(ctx.navNotes).toBe('Navigate to labs via sidebar');
    expect(ctx.credentials?.username).toBe('user@example.com');
    expect(ctx.outputDir).toBe('/tmp/output/my-provider');
    expect(ctx.providerId).toBe('my-provider');
    expect(ctx.cutoff).toBe(cutoff);
    expect(ctx.incremental).toBe(true);
    expect(ctx.authenticatedSelectors).toEqual(['.user-menu', '#dashboard']);
    expect(ctx.emitProgress).toBe(emitProgress);
  });

  it('allows cutoff to be null (full run)', () => {
    const ctx: ExtractionContext = {
      browser: makeBrowser(),
      portalUrl: 'https://portal.example.com',
      cutoff: null,
    };
    expect(ctx.cutoff).toBeNull();
  });

  it('allows credentials with only username (password optional)', () => {
    const ctx: ExtractionContext = {
      browser: makeBrowser(),
      portalUrl: 'https://portal.example.com',
      credentials: { username: 'user@example.com' },
    };
    expect(ctx.credentials?.username).toBe('user@example.com');
    expect(ctx.credentials?.password).toBeUndefined();
  });

  it('defaults incremental to undefined when not set', () => {
    const ctx: ExtractionContext = {
      browser: makeBrowser(),
      portalUrl: 'https://portal.example.com',
    };
    expect(ctx.incremental).toBeUndefined();
  });
});
