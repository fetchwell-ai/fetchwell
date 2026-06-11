/**
 * Unit tests for src/auth/detect-login-form.ts
 *
 * Covers:
 * - hasVisiblePasswordInput() — pure HTML parsing, no browser needed
 * - detectLoginFormType() — via mock BrowserProvider
 * - loadDetectedLoginFormType() / saveDetectedLoginFormType() — file I/O
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  hasVisiblePasswordInput,
  detectLoginFormType,
  loadDetectedLoginFormType,
  saveDetectedLoginFormType,
} from '../../src/auth/detect-login-form';
import type { BrowserProvider } from '../../src/browser/interface';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBrowser(opts: {
  passwordFieldFound?: boolean;
  html?: string;
} = {}): BrowserProvider {
  const { passwordFieldFound = false, html = '' } = opts;
  return {
    navigate: vi.fn().mockResolvedValue(undefined),
    act: vi.fn().mockResolvedValue(undefined),
    extract: vi.fn(),
    observe: vi.fn().mockResolvedValue([]),
    screenshot: vi.fn().mockResolvedValue(''),
    fill: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    getDebugUrl: vi.fn().mockResolvedValue(null),
    url: vi.fn().mockResolvedValue('https://portal.example.com/login'),
    title: vi.fn().mockResolvedValue(''),
    querySelector: vi.fn().mockResolvedValue(
      passwordFieldFound ? { textContent: async () => null } : null,
    ),
    pageText: vi.fn().mockResolvedValue(''),
    pageHtml: vi.fn().mockResolvedValue(html),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// hasVisiblePasswordInput — pure HTML parsing
// ---------------------------------------------------------------------------

describe('hasVisiblePasswordInput', () => {
  it('returns true for a plain password input', () => {
    expect(hasVisiblePasswordInput('<input type="password" name="pwd">')).toBe(true);
  });

  it('returns true for a password input with single-quote type attribute', () => {
    expect(hasVisiblePasswordInput("<input type='password' id='pass'>")).toBe(true);
  });

  it('returns true when type appears later in the attribute list', () => {
    expect(hasVisiblePasswordInput('<input name="pwd" class="form-control" type="password">')).toBe(true);
  });

  it('returns true for mixed-case TYPE attribute', () => {
    expect(hasVisiblePasswordInput('<input TYPE="password" name="pwd">')).toBe(true);
  });

  it('returns false when the password input has display:none inline style', () => {
    expect(
      hasVisiblePasswordInput('<input type="password" style="display:none">'),
    ).toBe(false);
  });

  it('returns false when the password input has display: none with a space', () => {
    expect(
      hasVisiblePasswordInput('<input type="password" style="display: none; color: red">'),
    ).toBe(false);
  });

  it('returns false when the password input has visibility:hidden inline style', () => {
    expect(
      hasVisiblePasswordInput('<input type="password" style="visibility:hidden">'),
    ).toBe(false);
  });

  it('returns false when the password input has visibility: hidden with a space', () => {
    expect(
      hasVisiblePasswordInput('<input type="password" style="visibility: hidden">'),
    ).toBe(false);
  });

  it('returns false when the password input has the hidden attribute', () => {
    expect(hasVisiblePasswordInput('<input type="password" hidden>')).toBe(false);
  });

  it('returns false when no password input exists', () => {
    expect(
      hasVisiblePasswordInput('<input type="text" name="username">'),
    ).toBe(false);
  });

  it('returns false for an empty HTML string', () => {
    expect(hasVisiblePasswordInput('')).toBe(false);
  });

  it('returns true if at least one password input is visible among multiple', () => {
    const html =
      '<input type="password" style="display:none" name="hidden-pwd">' +
      '<input type="password" name="visible-pwd">';
    expect(hasVisiblePasswordInput(html)).toBe(true);
  });

  it('returns false when all password inputs are hidden', () => {
    const html =
      '<input type="password" style="display:none">' +
      '<input type="password" hidden>';
    expect(hasVisiblePasswordInput(html)).toBe(false);
  });

  it('ignores input[type=text] even if labeled "password"', () => {
    expect(
      hasVisiblePasswordInput('<input type="text" placeholder="Password">'),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectLoginFormType — via mock BrowserProvider
// ---------------------------------------------------------------------------

describe('detectLoginFormType', () => {
  it('returns "single-page" when a visible password field is in the DOM and HTML', async () => {
    const browser = makeBrowser({
      passwordFieldFound: true,
      html: '<input type="password" name="pwd">',
    });
    const result = await detectLoginFormType(browser);
    expect(result).toBe('single-page');
    expect(browser.querySelector).toHaveBeenCalledWith('input[type="password"]');
    expect(browser.pageHtml).toHaveBeenCalled();
  });

  it('returns "two-step" when querySelector finds no password field', async () => {
    const browser = makeBrowser({ passwordFieldFound: false });
    const result = await detectLoginFormType(browser);
    expect(result).toBe('two-step');
    // Should short-circuit without calling pageHtml
    expect(browser.pageHtml).not.toHaveBeenCalled();
  });

  it('returns "two-step" when password field exists in DOM but HTML shows it as hidden', async () => {
    const browser = makeBrowser({
      passwordFieldFound: true,
      html: '<input type="password" style="display:none">',
    });
    const result = await detectLoginFormType(browser);
    expect(result).toBe('two-step');
  });

  it('returns "two-step" when querySelector throws', async () => {
    const browser = makeBrowser();
    (browser.querySelector as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('querySelector failed'),
    );
    const result = await detectLoginFormType(browser);
    expect(result).toBe('two-step');
  });

  it('returns "two-step" when pageHtml throws after querySelector succeeds', async () => {
    const browser = makeBrowser({ passwordFieldFound: true });
    (browser.pageHtml as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('pageHtml failed'),
    );
    const result = await detectLoginFormType(browser);
    expect(result).toBe('two-step');
  });

  it('does not call act() or observe() — purely deterministic', async () => {
    const browser = makeBrowser({ passwordFieldFound: false });
    await detectLoginFormType(browser);
    expect(browser.act).not.toHaveBeenCalled();
    expect(browser.observe).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// loadDetectedLoginFormType / saveDetectedLoginFormType — file I/O
// ---------------------------------------------------------------------------

describe('loadDetectedLoginFormType', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-login-form-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no cache file exists', () => {
    process.env.OUTPUT_DIR = tmpDir;
    const result = loadDetectedLoginFormType('test-provider', tmpDir);
    expect(result).toBeNull();
    delete process.env.OUTPUT_DIR;
  });

  it('returns "two-step" after saving "two-step"', () => {
    saveDetectedLoginFormType('test-provider', 'two-step', tmpDir);
    const result = loadDetectedLoginFormType('test-provider', tmpDir);
    expect(result).toBe('two-step');
  });

  it('returns "single-page" after saving "single-page"', () => {
    saveDetectedLoginFormType('test-provider', 'single-page', tmpDir);
    const result = loadDetectedLoginFormType('test-provider', tmpDir);
    expect(result).toBe('single-page');
  });

  it('returns null for corrupted cache file', () => {
    const dir = path.join(tmpDir, 'test-provider');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'login-form-type.json'), 'not valid json');
    const result = loadDetectedLoginFormType('test-provider', tmpDir);
    expect(result).toBeNull();
  });

  it('returns null for cache file with unknown loginForm value', () => {
    const dir = path.join(tmpDir, 'test-provider');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'login-form-type.json'),
      JSON.stringify({ loginForm: 'unknown-value' }),
    );
    const result = loadDetectedLoginFormType('test-provider', tmpDir);
    expect(result).toBeNull();
  });
});
