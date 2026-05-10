/**
 * Unit tests for the resilient navigateToSection helper.
 *
 * Mocks out browser I/O and nav-map file I/O so logic can be tested
 * without a real browser or filesystem.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before any imports so vitest hoists them
// ---------------------------------------------------------------------------

vi.mock('../../src/discover/nav-map.js', () => ({
  loadNavMap: vi.fn(),
  saveNavMap: vi.fn(),
}));

// Minimal mock of discover/index.js — just the constants we need
vi.mock('../../src/discover/index.js', () => ({
  SECTION_INSTRUCTIONS: {
    labs: [
      'Find and navigate to the test results or lab results page.',
      'Try opening the hamburger menu to find Test Results.',
    ],
    visits: [
      'Find and navigate to the visits or appointments page.',
      'Try opening the hamburger menu to find Visits.',
    ],
    medications: [
      'Find and navigate to the medications page.',
      'Try opening the hamburger menu to find Medications.',
    ],
    messages: [
      'Find and navigate to the messages or inbox page.',
      'Try opening the hamburger menu to find Messages.',
    ],
  },
  VERIFY_INSTRUCTIONS: {
    labs: 'Is this page showing a list of lab results or test results?',
    visits: 'Is this page showing a list of past visits or appointments?',
    medications: 'Is this page showing a list of medications?',
    messages: 'Is this page showing a list of messages or an inbox?',
  },
}));

// ---------------------------------------------------------------------------
// Imports — must come AFTER vi.mock calls
// ---------------------------------------------------------------------------

import { navigateToSection } from '../../src/extract/helpers.js';
import { loadNavMap, saveNavMap } from '../../src/discover/nav-map.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal mock BrowserProvider */
function makeBrowser(overrides: Partial<{
  navigate: Mock;
  act: Mock;
  extract: Mock;
  url: Mock;
}> = {}) {
  return {
    navigate: overrides.navigate ?? vi.fn().mockResolvedValue(undefined),
    act: overrides.act ?? vi.fn().mockResolvedValue(undefined),
    extract: overrides.extract ?? vi.fn().mockResolvedValue({ isCorrectPage: false, description: 'wrong page' }),
    url: overrides.url ?? vi.fn().mockResolvedValue('https://portal.example.com/section'),
    observe: vi.fn().mockResolvedValue([]),
    screenshot: vi.fn().mockResolvedValue(''),
    fill: vi.fn(),
    waitFor: vi.fn(),
    getDebugUrl: vi.fn().mockResolvedValue(null),
    title: vi.fn().mockResolvedValue(''),
    querySelector: vi.fn().mockResolvedValue(null),
    pageText: vi.fn().mockResolvedValue(''),
    pageHtml: vi.fn().mockResolvedValue(''),
    close: vi.fn(),
  };
}

/** A nav-map with a cached URL and a steps array for labs */
function makeNavMap(sectionOverrides: Record<string, object> = {}) {
  return {
    discoveredAt: '2026-01-01T00:00:00.000Z',
    portalName: 'Test Portal',
    sections: {
      labs: {
        steps: ['Find and navigate to the test results or lab results page.'],
        url: 'https://portal.example.com/labs',
        listInstruction: 'Find all lab result entries.',
      },
      ...sectionOverrides,
    },
  };
}

/**
 * Run navigateToSection while advancing fake timers so setTimeout calls don't hang.
 * Uses Promise.race-style concurrent execution: start the async call, then drain timers.
 */
async function runWithFakeTimers(fn: () => Promise<unknown>): Promise<unknown> {
  const promise = fn();
  await vi.runAllTimersAsync();
  return promise;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('navigateToSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns listInstruction when cached URL is valid', async () => {
    const navMap = makeNavMap();
    (loadNavMap as Mock).mockReturnValue(navMap);

    const browser = makeBrowser({
      extract: vi.fn().mockResolvedValue({ isCorrectPage: true, description: 'lab results page' }),
    });

    const result = await runWithFakeTimers(() =>
      navigateToSection(
        browser as any,
        'test-provider',
        'labs',
        { act: 'hardcoded fallback' },
        'https://portal.example.com/home',
      )
    ) as Awaited<ReturnType<typeof navigateToSection>>;

    // Should navigate to cached URL
    expect(browser.navigate).toHaveBeenCalledWith('https://portal.example.com/labs');
    // Should NOT replay steps or agentic search
    expect(browser.act).not.toHaveBeenCalled();
    // Should return listInstruction
    expect(result.listInstruction).toBe('Find all lab result entries.');
    expect(result.navigationFailed).toBeUndefined();
  });

  it('falls back to steps when cached URL verification fails', async () => {
    const navMap = makeNavMap();
    (loadNavMap as Mock).mockReturnValue(navMap);

    // First extract call (URL verify) → wrong page; second (after steps) → correct
    const extract = vi.fn()
      .mockResolvedValueOnce({ isCorrectPage: false, description: 'stale URL, wrong page' })
      .mockResolvedValueOnce({ isCorrectPage: true, description: 'lab results page' });

    const browser = makeBrowser({ extract });

    const result = await runWithFakeTimers(() =>
      navigateToSection(
        browser as any,
        'test-provider',
        'labs',
        { act: 'hardcoded fallback' },
        'https://portal.example.com/home',
      )
    ) as Awaited<ReturnType<typeof navigateToSection>>;

    // Should have tried the cached URL first
    expect(browser.navigate).toHaveBeenCalledWith('https://portal.example.com/labs');
    // Should replay nav-map steps after URL failure
    expect(browser.act).toHaveBeenCalledWith('Find and navigate to the test results or lab results page.');
    expect(result.listInstruction).toBe('Find all lab result entries.');
    expect(result.navigationFailed).toBeUndefined();
  });

  it('updates nav-map URL when steps succeed after URL failure', async () => {
    const navMap = makeNavMap();
    (loadNavMap as Mock).mockReturnValue(navMap);

    const extract = vi.fn()
      .mockResolvedValueOnce({ isCorrectPage: false, description: 'stale URL' })
      .mockResolvedValueOnce({ isCorrectPage: true, description: 'correct page' });

    const browser = makeBrowser({
      extract,
      url: vi.fn().mockResolvedValue('https://portal.example.com/labs-new'),
    });

    await runWithFakeTimers(() =>
      navigateToSection(
        browser as any,
        'test-provider',
        'labs',
        { act: 'hardcoded fallback' },
        'https://portal.example.com/home',
      )
    );

    // Nav-map should be saved with the new URL
    expect(saveNavMap).toHaveBeenCalledWith(
      expect.objectContaining({
        sections: expect.objectContaining({
          labs: expect.objectContaining({ url: 'https://portal.example.com/labs-new' }),
        }),
      }),
      'test-provider',
      undefined,
    );
  });

  it('falls back to agentic search when both URL and steps fail, and updates nav-map', async () => {
    const navMap = makeNavMap();
    (loadNavMap as Mock).mockReturnValue(navMap);

    // URL verify → fail; steps verify → fail; agentic attempt 1 → correct
    const extract = vi.fn()
      .mockResolvedValueOnce({ isCorrectPage: false, description: 'stale URL' })
      .mockResolvedValueOnce({ isCorrectPage: false, description: 'steps wrong page' })
      .mockResolvedValueOnce({ isCorrectPage: true, description: 'agentic found it' });

    const browser = makeBrowser({
      extract,
      url: vi.fn().mockResolvedValue('https://portal.example.com/labs-found'),
    });

    const result = await runWithFakeTimers(() =>
      navigateToSection(
        browser as any,
        'test-provider',
        'labs',
        { act: 'hardcoded fallback' },
        'https://portal.example.com/home',
      )
    ) as Awaited<ReturnType<typeof navigateToSection>>;

    expect(result.navigationFailed).toBeUndefined();
    // Nav-map should be updated with the agentic search result
    expect(saveNavMap).toHaveBeenCalledWith(
      expect.objectContaining({
        sections: expect.objectContaining({
          labs: expect.objectContaining({
            url: 'https://portal.example.com/labs-found',
            steps: ['Find and navigate to the test results or lab results page.'],
          }),
        }),
      }),
      'test-provider',
      undefined,
    );
  });

  it('returns navigationFailed when all tiers fail', async () => {
    const navMap = makeNavMap();
    (loadNavMap as Mock).mockReturnValue(navMap);

    // All verifications return false (2 SECTION_INSTRUCTIONS, plus URL and steps)
    const extract = vi.fn().mockResolvedValue({ isCorrectPage: false, description: 'wrong page' });

    const browser = makeBrowser({ extract });

    const result = await runWithFakeTimers(() =>
      navigateToSection(
        browser as any,
        'test-provider',
        'labs',
        { act: 'hardcoded fallback' },
        'https://portal.example.com/home',
      )
    ) as Awaited<ReturnType<typeof navigateToSection>>;

    expect(result.navigationFailed).toBe(true);
    expect(result.listInstruction).toBeUndefined();
  });

  it('uses hardcoded fallback act() when no homeUrl and no nav-map entry', async () => {
    (loadNavMap as Mock).mockReturnValue({
      discoveredAt: '2026-01-01T00:00:00.000Z',
      portalName: 'Test Portal',
      sections: {}, // no labs entry
    });

    const browser = makeBrowser();

    const result = await runWithFakeTimers(() =>
      navigateToSection(
        browser as any,
        'test-provider',
        'labs',
        { act: 'my hardcoded fallback act' },
        // no homeUrl — triggers hardcoded fallback
      )
    ) as Awaited<ReturnType<typeof navigateToSection>>;

    expect(browser.act).toHaveBeenCalledWith('my hardcoded fallback act');
    // Should return empty (no listInstruction, no navigationFailed)
    expect(result.navigationFailed).toBeUndefined();
    expect(result.listInstruction).toBeUndefined();
  });

  it('skips URL tier when nav-map entry has no URL, goes straight to steps', async () => {
    (loadNavMap as Mock).mockReturnValue({
      discoveredAt: '2026-01-01T00:00:00.000Z',
      portalName: 'Test Portal',
      sections: {
        labs: {
          steps: ['Find and navigate to the test results or lab results page.'],
          // no url field
          listInstruction: 'Find all lab result entries.',
        },
      },
    });

    const extract = vi.fn().mockResolvedValue({ isCorrectPage: true, description: 'labs page' });
    const browser = makeBrowser({ extract });

    const result = await runWithFakeTimers(() =>
      navigateToSection(
        browser as any,
        'test-provider',
        'labs',
        { act: 'hardcoded fallback' },
        'https://portal.example.com/home',
      )
    ) as Awaited<ReturnType<typeof navigateToSection>>;

    // Should go straight to steps (not navigate to a URL from nav-map entry)
    expect(browser.act).toHaveBeenCalledWith('Find and navigate to the test results or lab results page.');
    expect(result.navigationFailed).toBeUndefined();
    // listInstruction comes from the nav-map steps entry
    expect(result.listInstruction).toBe('Find all lab result entries.');
  });

  it('returns navigationFailed when no nav-map and no homeUrl provided', async () => {
    // No nav-map at all, no homeUrl — hardcoded fallback also throws
    (loadNavMap as Mock).mockReturnValue(null);

    const act = vi.fn().mockRejectedValue(new Error('browser act failed'));
    const browser = makeBrowser({ act });

    const result = await runWithFakeTimers(() =>
      navigateToSection(
        browser as any,
        'test-provider',
        'labs',
        { act: 'hardcoded fallback act' },
        // no homeUrl
      )
    ) as Awaited<ReturnType<typeof navigateToSection>>;

    expect(result.navigationFailed).toBe(true);
  });
});
