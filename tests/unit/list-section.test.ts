/**
 * Unit tests for the shared extractListSection engine (browser-agent-team-tfn.1).
 *
 * Covers:
 *   - Incremental skip when PDFs already exist
 *   - FORCE_* env var bypass of incremental skip (all three sections)
 *   - MAX_ITEMS_PER_SECTION cap (logged when triggered)
 *   - Probe mode: no PDFs written, screenshot saved
 *   - Selector-first click order (labs, visits): clickSelector before act()
 *   - Act-first click order (messages): act() before clickSelector
 *   - Nav-failed skip (selector-first only): screenshot saved, no PDF
 *   - observe() failure: returns 0, saves error screenshot
 *   - Behavior parity: labs / visits / messages all use the shared engine
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';

const TEST_TIMEOUT = 15_000;

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/auth.js', () => ({
  ensureLoggedIn: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/extract/helpers.js', () => ({
  readDirSafe: vi.fn().mockReturnValue([]),
  makeItemFilename: vi.fn((_i: number, label: string, ext: string) => `001_item${ext}`),
  makeVisitFilename: vi.fn(
    (_i: number, _desc: string, _title: string, ext: string) => `001_visit${ext}`,
  ),
  mergePdfs: vi.fn().mockResolvedValue(undefined),
  navigateWithRetry: vi.fn().mockResolvedValue(undefined),
  navigateToSection: vi.fn().mockResolvedValue({
    listInstruction: null,
    navigationFailed: false,
  }),
  logDepth: vi.fn().mockResolvedValue(undefined),
  shouldSkipIncremental: vi.fn().mockReturnValue(false),
  sleep: vi.fn().mockResolvedValue(undefined),
}));

import { extractListSection, probeListSection, MAX_ITEMS_PER_SECTION, type SectionSpec } from '../../src/extract/list-section.js';
import { extractLabsDocs } from '../../src/extract/labs.js';
import { extractVisits } from '../../src/extract/visits.js';
import { extractMessages } from '../../src/extract/messages.js';
import { readDirSafe, navigateToSection } from '../../src/extract/helpers.js';
import type { BrowserProvider, ObserveResult } from '../../src/browser/interface.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const LIST_URL = 'https://portal.example.com/list';
const DETAIL_URL = 'https://portal.example.com/detail-1';

function makeLink(overrides: Partial<ObserveResult> = {}): ObserveResult {
  return {
    selector: '#item-1',
    description: 'Test item 2024-01-01',
    ...overrides,
  };
}

/** Minimal SectionSpec for testing the engine directly. */
const TEST_SPEC: SectionSpec = {
  name: 'TestSection',
  sectionKey: 'labs',
  subDir: 'test-section',
  mergedName: 'test-section',
  forceEnvVar: 'FORCE_TEST_SECTION',
  fallbackAct: 'Navigate to test section',
  defaultObserve: 'Find all test items',
  makeFilename: (_index, _desc, _title, _providerId) => '001_item.pdf',
  itemLabel: (_desc, title, _i) => title || 'test-item',
  clickOrder: 'selector-first',
};

/** Act-first variant for messages-style testing. */
const TEST_SPEC_ACT_FIRST: SectionSpec = {
  ...TEST_SPEC,
  clickOrder: 'act-first',
};

/**
 * Build a mock BrowserProvider.
 * @param navigates  If true, url() changes to DETAIL_URL after the first click.
 * @param hasClickSelector  Include the optional clickSelector method.
 * @param hasPdf  Include the optional pdf() method.
 */
function makeBrowser(opts: {
  navigates?: boolean;
  hasClickSelector?: boolean;
  hasPdf?: boolean;
  observeResult?: ObserveResult[];
} = {}): BrowserProvider {
  const {
    navigates = true,
    hasClickSelector = true,
    hasPdf = true,
    observeResult = [makeLink()],
  } = opts;

  let clicked = false;

  const browser: Partial<BrowserProvider> = {
    navigate: vi.fn().mockResolvedValue(undefined),
    act: vi.fn().mockImplementation(async () => {
      if (navigates) clicked = true;
    }),
    extract: vi.fn(),
    observe: vi.fn().mockResolvedValue(observeResult),
    screenshot: vi.fn().mockResolvedValue('base64png'),
    fill: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    getDebugUrl: vi.fn().mockResolvedValue(null),
    url: vi.fn().mockImplementation(async () => (clicked ? DETAIL_URL : LIST_URL)),
    title: vi.fn().mockResolvedValue('Detail Page'),
    querySelector: vi.fn().mockResolvedValue(null),
    pageText: vi.fn().mockResolvedValue(''),
    pageHtml: vi.fn().mockResolvedValue(''),
    close: vi.fn().mockResolvedValue(undefined),
  };

  if (hasClickSelector) {
    browser.clickSelector = vi.fn().mockImplementation(async () => {
      if (navigates) clicked = true;
    });
  }

  if (hasPdf) {
    browser.pdf = vi.fn().mockResolvedValue(Buffer.from('PDF'));
  }

  return browser as BrowserProvider;
}

// ---------------------------------------------------------------------------
// Helper: make a temp dir, clean up after each test
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetchwell-list-section-'));
  vi.clearAllMocks();
});

afterEach(() => {
  // Restore env vars
  delete process.env.FORCE_TEST_SECTION;
  delete process.env.FORCE_LABS;
  delete process.env.FORCE_VISITS;
  delete process.env.FORCE_MSGS;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// MAX_ITEMS_PER_SECTION constant
// ---------------------------------------------------------------------------

describe('MAX_ITEMS_PER_SECTION', () => {
  it('is exported and equals 50', () => {
    expect(MAX_ITEMS_PER_SECTION).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Incremental skip
// ---------------------------------------------------------------------------

describe('extractListSection — incremental skip', () => {
  it('skips the section when incremental=true and PDFs already exist', async () => {
    // Simulate existing PDFs in the section directory on the first call (skip check),
    // then return empty for subsequent calls (savedFiles for the per-item loop).
    vi.mocked(readDirSafe)
      .mockReturnValueOnce(['001_item.pdf', '002_item.pdf']) // skip check
      .mockReturnValue([]); // savedFiles (not reached)

    const browser = makeBrowser();
    const count = await extractListSection(TEST_SPEC, {
      browser,
      portalUrl: LIST_URL,
      outputDir: tmpDir,
      incremental: true,
    });

    expect(count).toBe(0);
    // navigateToSection should not have been called (skipped early)
    expect(navigateToSection).not.toHaveBeenCalled();
  }, TEST_TIMEOUT);

  it('does NOT skip when incremental=false even if PDFs exist', async () => {
    vi.mocked(readDirSafe)
      .mockReturnValueOnce(['001_item.pdf']) // skip check (would skip if incremental)
      .mockReturnValue([]); // savedFiles for per-item loop

    const browser = makeBrowser();
    const count = await extractListSection(TEST_SPEC, {
      browser,
      portalUrl: LIST_URL,
      outputDir: tmpDir,
      incremental: false,
    });

    expect(count).toBe(1);
    expect(navigateToSection).toHaveBeenCalled();
  }, TEST_TIMEOUT);

  it('does NOT skip when no PDFs exist (incremental=true)', async () => {
    vi.mocked(readDirSafe).mockReturnValue([]);

    const browser = makeBrowser();
    const count = await extractListSection(TEST_SPEC, {
      browser,
      portalUrl: LIST_URL,
      outputDir: tmpDir,
      incremental: true,
    });

    expect(count).toBe(1);
    expect(navigateToSection).toHaveBeenCalled();
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// FORCE_* env var bypass
// ---------------------------------------------------------------------------

describe('extractListSection — FORCE_* env var bypass', () => {
  it('bypasses incremental skip when FORCE_* is set to "1"', async () => {
    vi.mocked(readDirSafe)
      .mockReturnValueOnce(['001_item.pdf']) // skip check — would skip without FORCE_*
      .mockReturnValue([]);                  // savedFiles for per-item loop
    process.env.FORCE_TEST_SECTION = '1';

    const browser = makeBrowser();
    const count = await extractListSection(TEST_SPEC, {
      browser,
      portalUrl: LIST_URL,
      outputDir: tmpDir,
      incremental: true,
    });

    // Should have run extraction (not skipped)
    expect(navigateToSection).toHaveBeenCalled();
    expect(count).toBe(1);
  }, TEST_TIMEOUT);

  it('does NOT bypass when FORCE_* is "0"', async () => {
    vi.mocked(readDirSafe)
      .mockReturnValueOnce(['001_item.pdf'])
      .mockReturnValue([]);
    process.env.FORCE_TEST_SECTION = '0';

    const browser = makeBrowser();
    const count = await extractListSection(TEST_SPEC, {
      browser,
      portalUrl: LIST_URL,
      outputDir: tmpDir,
      incremental: true,
    });

    expect(count).toBe(0);
    expect(navigateToSection).not.toHaveBeenCalled();
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// FORCE_* parity across labs / visits / messages
// ---------------------------------------------------------------------------

describe('FORCE_* parity: labs / visits / messages all bypass incremental skip', () => {
  it('FORCE_LABS=1 bypasses skip for extractLabsDocs', async () => {
    vi.mocked(readDirSafe)
      .mockReturnValueOnce(['001_item.pdf']) // skip check
      .mockReturnValue([]);                  // savedFiles
    process.env.FORCE_LABS = '1';

    const browser = makeBrowser();
    const count = await extractLabsDocs({
      browser,
      portalUrl: LIST_URL,
      outputDir: tmpDir,
      incremental: true,
    });

    expect(navigateToSection).toHaveBeenCalled();
    expect(count).toBe(1);
  }, TEST_TIMEOUT);

  it('FORCE_VISITS=1 bypasses skip for extractVisits', async () => {
    vi.mocked(readDirSafe)
      .mockReturnValueOnce(['001_item.pdf']) // skip check
      .mockReturnValue([]);                  // savedFiles
    process.env.FORCE_VISITS = '1';

    const browser = makeBrowser();
    const count = await extractVisits({
      browser,
      portalUrl: LIST_URL,
      outputDir: tmpDir,
      incremental: true,
    });

    expect(navigateToSection).toHaveBeenCalled();
    expect(count).toBe(1);
  }, TEST_TIMEOUT);

  it('FORCE_MSGS=1 bypasses skip for extractMessages (does NOT delete directory)', async () => {
    // Create some files in the messages directory to confirm they are not deleted
    const msgsDir = path.join(tmpDir, 'messages');
    fs.mkdirSync(msgsDir, { recursive: true });
    fs.writeFileSync(path.join(msgsDir, '001_old.pdf'), 'old');

    vi.mocked(readDirSafe)
      .mockReturnValueOnce(['001_old.pdf']) // skip check
      .mockReturnValue([]);                 // savedFiles for per-item loop
    process.env.FORCE_MSGS = '1';

    const browser = makeBrowser();
    const count = await extractMessages({
      browser,
      portalUrl: LIST_URL,
      outputDir: tmpDir,
      incremental: true,
    });

    expect(navigateToSection).toHaveBeenCalled();
    expect(count).toBe(1);
    // Old file must NOT have been deleted (bypass-only, not delete-and-rerun)
    expect(fs.existsSync(path.join(msgsDir, '001_old.pdf'))).toBe(true);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Messages: section-level incremental skip (was missing before this task)
// ---------------------------------------------------------------------------

describe('extractMessages — section-level incremental skip (new behavior)', () => {
  it('skips messages section when incremental=true and PDFs exist', async () => {
    vi.mocked(readDirSafe).mockReturnValue(['001_msg.pdf']);

    const browser = makeBrowser();
    const count = await extractMessages({
      browser,
      portalUrl: LIST_URL,
      outputDir: tmpDir,
      incremental: true,
    });

    expect(count).toBe(0);
    expect(navigateToSection).not.toHaveBeenCalled();
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// MAX_ITEMS_PER_SECTION cap + logging
// ---------------------------------------------------------------------------

describe('extractListSection — item cap', () => {
  it('logs the cap message and processes at most maxItems items', async () => {
    // Use maxItems: 3 so only 3 items are processed (not 50).
    // Use act-first click order so items don't trigger the nav-failed guard when
    // the makeBrowser mock doesn't reset URL state between items.
    const capSpec: SectionSpec = { ...TEST_SPEC_ACT_FIRST, maxItems: 3 };
    const fiveLinks = Array.from({ length: 5 }, (_, i) => ({
      selector: `#item-${i}`,
      description: `Test item ${i + 1}`,
    }));
    const browser = makeBrowser({ observeResult: fiveLinks });
    const consoleSpy = vi.spyOn(console, 'log');

    const count = await extractListSection(capSpec, {
      browser,
      portalUrl: LIST_URL,
      outputDir: tmpDir,
    });

    // Should not have processed more than the spec cap
    expect(count).toBe(3);
    // Should have logged the cap (references MAX_ITEMS_PER_SECTION in the message)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('capping at 3'),
    );
    consoleSpy.mockRestore();
  }, TEST_TIMEOUT);

  it('does NOT log the cap when item count is at or below the limit', async () => {
    const items = Array.from({ length: 3 }, (_, i) => ({
      selector: `#item-${i}`,
      description: `Item ${i + 1}`,
    }));
    const browser = makeBrowser({ observeResult: items });
    const consoleSpy = vi.spyOn(console, 'log');

    await extractListSection(TEST_SPEC, {
      browser,
      portalUrl: LIST_URL,
      outputDir: tmpDir,
    });

    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('capping at'),
    );
    consoleSpy.mockRestore();
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Probe mode
// ---------------------------------------------------------------------------

describe('probeListSection', () => {
  it('does not write PDFs in probe mode', async () => {
    const browser = makeBrowser();
    const probeDir = path.join(tmpDir, 'probe');
    fs.mkdirSync(probeDir, { recursive: true });

    await probeListSection(TEST_SPEC, browser, LIST_URL, probeDir);

    // No PDF files should be written
    const files = fs.readdirSync(probeDir);
    expect(files.filter((f) => f.endsWith('.pdf'))).toHaveLength(0);
  }, TEST_TIMEOUT);

  it('saves a screenshot in probe mode', async () => {
    const browser = makeBrowser();
    const probeDir = path.join(tmpDir, 'probe');
    fs.mkdirSync(probeDir, { recursive: true });

    await probeListSection(TEST_SPEC, browser, LIST_URL, probeDir);

    const screenshotPath = path.join(probeDir, `${TEST_SPEC.subDir}.png`);
    expect(fs.existsSync(screenshotPath)).toBe(true);
  }, TEST_TIMEOUT);

  it('logs item count in probe mode', async () => {
    const browser = makeBrowser({ observeResult: [makeLink(), makeLink()] });
    const probeDir = path.join(tmpDir, 'probe');
    fs.mkdirSync(probeDir, { recursive: true });
    const consoleSpy = vi.spyOn(console, 'log');

    await probeListSection(TEST_SPEC, browser, LIST_URL, probeDir);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('2 item(s) found'),
    );
    consoleSpy.mockRestore();
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Click order: selector-first (labs, visits)
// ---------------------------------------------------------------------------

describe('extractListSection — selector-first click order', () => {
  it('calls clickSelector before act() when selector is available', async () => {
    const browser = makeBrowser({ navigates: true });
    await extractListSection(TEST_SPEC, { browser, portalUrl: LIST_URL, outputDir: tmpDir });

    expect(browser.clickSelector).toHaveBeenCalledWith('#item-1');
    // act() should NOT have been called with the item click (clickSelector navigated)
    expect(browser.act).not.toHaveBeenCalledWith(expect.stringContaining('Click the element'));
  }, TEST_TIMEOUT);

  it('falls back to act() when clickSelector does not navigate', async () => {
    // clickSelector exists but doesn't change the URL; act() does
    let actCalled = false;
    const browser: BrowserProvider = {
      ...makeBrowser({ navigates: false }),
      act: vi.fn().mockImplementation(async () => { actCalled = true; }),
      url: vi.fn().mockImplementation(async () => actCalled ? DETAIL_URL : LIST_URL),
      clickSelector: vi.fn().mockResolvedValue(undefined), // doesn't navigate
    };

    await extractListSection(TEST_SPEC, { browser, portalUrl: LIST_URL, outputDir: tmpDir });

    expect(browser.clickSelector).toHaveBeenCalled();
    expect(browser.act).toHaveBeenCalledWith(expect.stringContaining('Click the element'));
  }, TEST_TIMEOUT);

  it('skips PDF and saves nav-failed screenshot when both click methods fail', async () => {
    const browser = makeBrowser({ navigates: false });
    const count = await extractListSection(TEST_SPEC, {
      browser,
      portalUrl: LIST_URL,
      outputDir: tmpDir,
    });

    expect(count).toBe(0);
    expect(browser.pdf).not.toHaveBeenCalled();

    const sectionDir = path.join(tmpDir, TEST_SPEC.subDir);
    const files = fs.readdirSync(sectionDir);
    expect(files.some((f) => f.includes('nav-failed'))).toBe(true);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Click order: act-first (messages)
// ---------------------------------------------------------------------------

describe('extractListSection — act-first click order', () => {
  it('calls act() before clickSelector when clickOrder=act-first', async () => {
    const callOrder: string[] = [];
    let acted = false;
    const browser: BrowserProvider = {
      ...makeBrowser({ navigates: false }),
      act: vi.fn().mockImplementation(async () => {
        callOrder.push('act');
        acted = true;
      }),
      url: vi.fn().mockImplementation(async () => acted ? DETAIL_URL : LIST_URL),
      clickSelector: vi.fn().mockImplementation(async () => {
        callOrder.push('clickSelector');
      }),
    };

    await extractListSection(TEST_SPEC_ACT_FIRST, {
      browser,
      portalUrl: LIST_URL,
      outputDir: tmpDir,
    });

    // act() must appear before clickSelector in the call order
    const actIdx = callOrder.findIndex((c) => c === 'act');
    const csIdx = callOrder.findIndex((c) => c === 'clickSelector');
    expect(actIdx).toBeLessThan(csIdx >= 0 ? csIdx : Infinity);
  }, TEST_TIMEOUT);

  it('falls back to clickSelector when act() does not navigate (act-first)', async () => {
    let clickSelectorCalled = false;
    const browser: BrowserProvider = {
      ...makeBrowser({ navigates: false }),
      act: vi.fn().mockResolvedValue(undefined), // doesn't navigate
      url: vi.fn().mockImplementation(async () =>
        clickSelectorCalled ? DETAIL_URL : LIST_URL,
      ),
      clickSelector: vi.fn().mockImplementation(async () => {
        clickSelectorCalled = true;
      }),
    };

    const count = await extractListSection(TEST_SPEC_ACT_FIRST, {
      browser,
      portalUrl: LIST_URL,
      outputDir: tmpDir,
    });

    expect(browser.clickSelector).toHaveBeenCalled();
    expect(count).toBe(1);
  }, TEST_TIMEOUT);

  it('does NOT save nav-failed screenshot in act-first mode (legacy behavior)', async () => {
    // In act-first mode, there is no nav-failed bail-out — the extractor proceeds
    // to the PDF step regardless of URL change. This preserves the prior messages behavior.
    const browser = makeBrowser({ navigates: false, clickOrder: undefined } as never);
    await extractListSection(TEST_SPEC_ACT_FIRST, {
      browser,
      portalUrl: LIST_URL,
      outputDir: tmpDir,
    });

    const sectionDir = path.join(tmpDir, TEST_SPEC_ACT_FIRST.subDir);
    // nav-failed file should NOT be present
    const files = fs.existsSync(sectionDir) ? fs.readdirSync(sectionDir) : [];
    expect(files.some((f) => f.includes('nav-failed'))).toBe(false);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// observe() failure
// ---------------------------------------------------------------------------

describe('extractListSection — observe() failure', () => {
  it('returns 0 without throwing when observe() rejects', async () => {
    const browser: BrowserProvider = {
      ...makeBrowser(),
      observe: vi.fn().mockRejectedValue(new Error('AI timeout')),
    };

    const count = await extractListSection(TEST_SPEC, {
      browser,
      portalUrl: LIST_URL,
      outputDir: tmpDir,
    });

    expect(count).toBe(0);
  }, TEST_TIMEOUT);

  it('saves an observe-error screenshot when observe() rejects', async () => {
    const browser: BrowserProvider = {
      ...makeBrowser(),
      observe: vi.fn().mockRejectedValue(new Error('AI timeout')),
    };

    await extractListSection(TEST_SPEC, {
      browser,
      portalUrl: LIST_URL,
      outputDir: tmpDir,
    });

    const sectionDir = path.join(tmpDir, TEST_SPEC.subDir);
    const files = fs.readdirSync(sectionDir);
    expect(files.some((f) => f.includes('observe-error'))).toBe(true);
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Navigation failure (navigateToSection returns navigationFailed)
// ---------------------------------------------------------------------------

describe('extractListSection — navigation failure', () => {
  it('returns 0 when navigateToSection reports navigationFailed', async () => {
    vi.mocked(navigateToSection).mockResolvedValueOnce({ navigationFailed: true });

    const browser = makeBrowser();
    const count = await extractListSection(TEST_SPEC, {
      browser,
      portalUrl: LIST_URL,
      outputDir: tmpDir,
    });

    expect(count).toBe(0);
    expect(browser.observe).not.toHaveBeenCalled();
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Behavior parity: labs / visits / messages all use the shared engine
// ---------------------------------------------------------------------------

describe('Behavior parity via shared engine', () => {
  it('extractLabsDocs returns 1 when navigation and PDF succeed', async () => {
    const browser = makeBrowser();
    const count = await extractLabsDocs({
      browser,
      portalUrl: LIST_URL,
      outputDir: tmpDir,
    });
    expect(count).toBe(1);
  }, TEST_TIMEOUT);

  it('extractVisits returns 1 when navigation and PDF succeed', async () => {
    const browser = makeBrowser();
    const count = await extractVisits({
      browser,
      portalUrl: LIST_URL,
      outputDir: path.join(tmpDir, 'v'),
    });
    expect(count).toBe(1);
  }, TEST_TIMEOUT);

  it('extractMessages returns 1 when navigation and PDF succeed', async () => {
    const browser = makeBrowser();
    const count = await extractMessages({
      browser,
      portalUrl: LIST_URL,
      outputDir: path.join(tmpDir, 'm'),
    });
    expect(count).toBe(1);
  }, TEST_TIMEOUT);

  it('extractLabsDocs returns 0 when observe() fails', async () => {
    const browser: BrowserProvider = {
      ...makeBrowser(),
      observe: vi.fn().mockRejectedValue(new Error('fail')),
    };
    const count = await extractLabsDocs({ browser, portalUrl: LIST_URL, outputDir: tmpDir });
    expect(count).toBe(0);
  }, TEST_TIMEOUT);

  it('extractVisits returns 0 when observe() fails', async () => {
    const browser: BrowserProvider = {
      ...makeBrowser(),
      observe: vi.fn().mockRejectedValue(new Error('fail')),
    };
    const count = await extractVisits({ browser, portalUrl: LIST_URL, outputDir: path.join(tmpDir, 'v2') });
    expect(count).toBe(0);
  }, TEST_TIMEOUT);

  it('extractMessages returns 0 when observe() fails', async () => {
    const browser: BrowserProvider = {
      ...makeBrowser(),
      observe: vi.fn().mockRejectedValue(new Error('fail')),
    };
    const count = await extractMessages({ browser, portalUrl: LIST_URL, outputDir: path.join(tmpDir, 'm2') });
    expect(count).toBe(0);
  }, TEST_TIMEOUT);
});
