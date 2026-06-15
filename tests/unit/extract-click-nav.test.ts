/**
 * Unit tests for selector-first click + URL-change verification in extractLabsDocs
 * and extractVisits (browser-agent-team-8ru.2).
 *
 * Mocks filesystem, auth, helpers, and browser so the logic runs without a real browser.
 * Key behaviors tested:
 *   1. clickSelector is called first when available; act() is the fallback.
 *   2. PDF is skipped (screenshot saved) when URL does not change after all click attempts.
 *   3. PDF is written when URL changes successfully.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Each extraction test involves real setTimeout() waits in the source code
// (3000ms nav wait + 1000ms click wait + 1500ms list-return wait = ~5.5s per item).
// Set a per-test timeout that comfortably covers one iteration.
const TEST_TIMEOUT = 15_000;

// ---------------------------------------------------------------------------
// Module mocks — hoisted by vitest before any imports
// ---------------------------------------------------------------------------

vi.mock('../../src/auth.js', () => ({
  ensureLoggedIn: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/extract/helpers.js', () => ({
  readDirSafe: vi.fn().mockReturnValue([]),
  makeItemFilename: vi.fn((_i: number, label: string, ext: string) => `001_result${ext}`),
  makeVisitFilename: vi.fn((_i: number, _desc: string, _title: string, ext: string) => `001_visit${ext}`),
  mergePdfs: vi.fn().mockResolvedValue(undefined),
  navigateWithRetry: vi.fn().mockResolvedValue(undefined),
  navigateToSection: vi.fn().mockResolvedValue({ listInstruction: null, navigationFailed: false }),
  logDepth: vi.fn().mockResolvedValue(undefined),
  shouldSkipIncremental: vi.fn().mockReturnValue(false),
  sleep: vi.fn().mockResolvedValue(undefined),
}));

import { extractLabsDocs } from '../../src/extract/labs.js';
import { extractVisits } from '../../src/extract/visits.js';
import type { BrowserProvider, ObserveResult } from '../../src/browser/interface.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LIST_URL = 'https://portal.example.com/list';
const DETAIL_URL = 'https://portal.example.com/detail-1';

function makeLink(overrides: Partial<ObserveResult> = {}): ObserveResult {
  return {
    selector: '#result-1',
    description: 'CBC result 2024-01-01',
    ...overrides,
  };
}

/**
 * Build a mock BrowserProvider.
 * @param opts.navigates  When true, url() returns DETAIL_URL after first click; stays LIST_URL otherwise.
 * @param opts.hasClickSelector  Include optional clickSelector method (default true).
 * @param opts.hasPdf  Include optional pdf() method (default true).
 */
function makeBrowser(opts: {
  navigates?: boolean;
  hasClickSelector?: boolean;
  hasPdf?: boolean;
} = {}): BrowserProvider {
  const { navigates = true, hasClickSelector = true, hasPdf = true } = opts;

  let clicked = false;

  const browser: Partial<BrowserProvider> = {
    navigate: vi.fn().mockResolvedValue(undefined),
    act: vi.fn().mockImplementation(async () => {
      if (navigates) clicked = true;
    }),
    extract: vi.fn(),
    observe: vi.fn().mockResolvedValue([makeLink()]),
    screenshot: vi.fn().mockResolvedValue('base64png'),
    fill: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    getDebugUrl: vi.fn().mockResolvedValue(null),
    url: vi.fn().mockImplementation(async () => (clicked ? DETAIL_URL : LIST_URL)),
    title: vi.fn().mockResolvedValue('Result Detail'),
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
// Labs tests
// ---------------------------------------------------------------------------

describe('extractLabsDocs — selector-first click + URL verification', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetchwell-labs-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('calls clickSelector before act() when selector is available', async () => {
    const browser = makeBrowser({ navigates: true });
    await extractLabsDocs({ browser, portalUrl: LIST_URL, outputDir: tmpDir });

    expect(browser.clickSelector).toHaveBeenCalledWith('#result-1');
    // act() should NOT be called with the item click instruction because
    // clickSelector already navigated successfully
    expect(browser.act).not.toHaveBeenCalledWith(expect.stringContaining('Click the element'));
  }, TEST_TIMEOUT);

  it('falls back to act() when clickSelector does not navigate', async () => {
    let actClicked = false;
    const browser: BrowserProvider = {
      navigate: vi.fn().mockResolvedValue(undefined),
      act: vi.fn().mockImplementation(async () => { actClicked = true; }),
      extract: vi.fn(),
      observe: vi.fn().mockResolvedValue([makeLink()]),
      screenshot: vi.fn().mockResolvedValue('base64png'),
      fill: vi.fn().mockResolvedValue(undefined),
      waitFor: vi.fn().mockResolvedValue(undefined),
      getDebugUrl: vi.fn().mockResolvedValue(null),
      url: vi.fn().mockImplementation(async () => actClicked ? DETAIL_URL : LIST_URL),
      title: vi.fn().mockResolvedValue('CBC Result'),
      querySelector: vi.fn().mockResolvedValue(null),
      pageText: vi.fn().mockResolvedValue(''),
      pageHtml: vi.fn().mockResolvedValue(''),
      close: vi.fn().mockResolvedValue(undefined),
      // clickSelector exists but doesn't navigate (URL stays the same)
      clickSelector: vi.fn().mockResolvedValue(undefined),
      pdf: vi.fn().mockResolvedValue(Buffer.from('PDF')),
    };

    await extractLabsDocs({ browser, portalUrl: LIST_URL, outputDir: tmpDir });

    expect(browser.clickSelector).toHaveBeenCalled();
    expect(browser.act).toHaveBeenCalledWith(expect.stringContaining('Click the element'));
  }, TEST_TIMEOUT);

  it('skips PDF and saves nav-failed screenshot when navigation fails', async () => {
    const browser = makeBrowser({ navigates: false });
    const count = await extractLabsDocs({ browser, portalUrl: LIST_URL, outputDir: tmpDir });

    expect(count).toBe(0);
    expect(browser.pdf).not.toHaveBeenCalled();

    const labsDir = path.join(tmpDir, 'labs');
    const files = fs.readdirSync(labsDir);
    expect(files.some((f) => f.includes('nav-failed'))).toBe(true);
  }, TEST_TIMEOUT);

  it('writes PDF when navigation succeeds', async () => {
    const browser = makeBrowser({ navigates: true });
    const count = await extractLabsDocs({ browser, portalUrl: LIST_URL, outputDir: tmpDir });

    expect(count).toBe(1);
    expect(browser.pdf).toHaveBeenCalled();

    const labsDir = path.join(tmpDir, 'labs');
    const pdfFiles = fs.readdirSync(labsDir).filter((f) => f.endsWith('.pdf'));
    expect(pdfFiles.length).toBe(1);
  }, TEST_TIMEOUT);

  it('uses act() when no clickSelector method is present', async () => {
    const browser = makeBrowser({ navigates: true, hasClickSelector: false });
    await extractLabsDocs({ browser, portalUrl: LIST_URL, outputDir: tmpDir });

    expect(browser.clickSelector).toBeUndefined();
    expect(browser.act).toHaveBeenCalledWith(expect.stringContaining('Click the element'));
  }, TEST_TIMEOUT);
});

// ---------------------------------------------------------------------------
// Visits tests
// ---------------------------------------------------------------------------

describe('extractVisits — selector-first click + URL verification', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetchwell-visits-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('calls clickSelector before act() when selector is available', async () => {
    const browser = makeBrowser({ navigates: true });
    await extractVisits({ browser, portalUrl: LIST_URL, outputDir: tmpDir });

    expect(browser.clickSelector).toHaveBeenCalledWith('#result-1');
    expect(browser.act).not.toHaveBeenCalledWith(expect.stringContaining('Click the element'));
  }, TEST_TIMEOUT);

  it('skips PDF and saves nav-failed screenshot when navigation fails', async () => {
    const browser = makeBrowser({ navigates: false });
    const count = await extractVisits({ browser, portalUrl: LIST_URL, outputDir: tmpDir });

    expect(count).toBe(0);
    expect(browser.pdf).not.toHaveBeenCalled();

    const visitsDir = path.join(tmpDir, 'visits');
    const files = fs.readdirSync(visitsDir);
    expect(files.some((f) => f.includes('nav-failed'))).toBe(true);
  }, TEST_TIMEOUT);

  it('writes PDF when navigation succeeds', async () => {
    const browser = makeBrowser({ navigates: true });
    const count = await extractVisits({ browser, portalUrl: LIST_URL, outputDir: tmpDir });

    expect(count).toBe(1);
    expect(browser.pdf).toHaveBeenCalled();

    const visitsDir = path.join(tmpDir, 'visits');
    const pdfFiles = fs.readdirSync(visitsDir).filter((f) => f.endsWith('.pdf'));
    expect(pdfFiles.length).toBe(1);
  }, TEST_TIMEOUT);

  it('falls back to act() when clickSelector does not navigate', async () => {
    let actClicked = false;
    const browser: BrowserProvider = {
      navigate: vi.fn().mockResolvedValue(undefined),
      act: vi.fn().mockImplementation(async () => { actClicked = true; }),
      extract: vi.fn(),
      observe: vi.fn().mockResolvedValue([makeLink()]),
      screenshot: vi.fn().mockResolvedValue('base64png'),
      fill: vi.fn().mockResolvedValue(undefined),
      waitFor: vi.fn().mockResolvedValue(undefined),
      getDebugUrl: vi.fn().mockResolvedValue(null),
      url: vi.fn().mockImplementation(async () => actClicked ? DETAIL_URL : LIST_URL),
      title: vi.fn().mockResolvedValue('After Visit Summary'),
      querySelector: vi.fn().mockResolvedValue(null),
      pageText: vi.fn().mockResolvedValue(''),
      pageHtml: vi.fn().mockResolvedValue(''),
      close: vi.fn().mockResolvedValue(undefined),
      // clickSelector exists but doesn't navigate
      clickSelector: vi.fn().mockResolvedValue(undefined),
      pdf: vi.fn().mockResolvedValue(Buffer.from('PDF')),
    };

    await extractVisits({ browser, portalUrl: LIST_URL, outputDir: tmpDir });

    expect(browser.clickSelector).toHaveBeenCalled();
    expect(browser.act).toHaveBeenCalledWith(expect.stringContaining('Click the element'));
  }, TEST_TIMEOUT);
});
