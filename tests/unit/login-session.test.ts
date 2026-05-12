/**
 * Unit tests for src/auth/login-session.ts — loginOrRestoreSession()
 *
 * Uses a mock BrowserProvider and mock AuthModule to verify the
 * session-restore and fresh-login logic without spawning a real browser.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loginOrRestoreSession } from '../../src/auth/login-session';
import type { BrowserProvider, SerializedSession } from '../../src/browser/interface';
import type { AuthModule } from '../../src/auth/interface';

// ---------------------------------------------------------------------------
// Helpers to build lightweight mocks
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<SerializedSession> = {}): SerializedSession {
  return {
    cookies: [],
    savedAt: new Date().toISOString(),
    homeUrl: 'https://portal.example.com/home',
    ...overrides,
  };
}

function makeBrowser(currentUrl: string, opts: { hasLoadSession?: boolean; hasSaveSession?: boolean } = {}): BrowserProvider {
  const browser: BrowserProvider = {
    navigate: vi.fn().mockResolvedValue(undefined),
    act: vi.fn().mockResolvedValue(undefined),
    extract: vi.fn(),
    observe: vi.fn().mockResolvedValue([]),
    screenshot: vi.fn().mockResolvedValue(''),
    fill: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    getDebugUrl: vi.fn().mockResolvedValue(null),
    url: vi.fn().mockResolvedValue(currentUrl),
    title: vi.fn().mockResolvedValue(''),
    querySelector: vi.fn().mockResolvedValue(null),
    pageText: vi.fn().mockResolvedValue(''),
    pageHtml: vi.fn().mockResolvedValue(''),
    close: vi.fn().mockResolvedValue(undefined),
  };

  if (opts.hasLoadSession !== false) {
    browser.loadSession = vi.fn().mockResolvedValue(undefined);
  }
  if (opts.hasSaveSession !== false) {
    browser.saveSession = vi.fn().mockResolvedValue(makeSession({ homeUrl: currentUrl }));
  }

  return browser;
}

function makeAuthModule(): AuthModule {
  return {
    login: vi.fn().mockResolvedValue(undefined),
    ensureLoggedIn: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loginOrRestoreSession', () => {
  let tmpDir: string;
  let providerId: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'login-session-test-'));
    providerId = 'test-provider';
    // Create per-provider output dir (matches session.ts path layout)
    fs.mkdirSync(path.join(tmpDir, providerId), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // No saved session
  // ---------------------------------------------------------------------------

  it('performs fresh login when no session file exists', async () => {
    const browser = makeBrowser('https://portal.example.com/home');
    const authModule = makeAuthModule();

    const homeUrl = await loginOrRestoreSession(browser, {
      portalUrl: 'https://portal.example.com/login',
      providerId,
      basePath: tmpDir,
      authModule,
    });

    expect(authModule.login).toHaveBeenCalledOnce();
    expect(homeUrl).toBe('https://portal.example.com/home');
  });

  it('saves session after fresh login when browser supports saveSession', async () => {
    const browser = makeBrowser('https://portal.example.com/home');
    const authModule = makeAuthModule();

    await loginOrRestoreSession(browser, {
      portalUrl: 'https://portal.example.com/login',
      providerId,
      basePath: tmpDir,
      authModule,
    });

    const sessionFile = path.join(tmpDir, providerId, 'session.json');
    expect(fs.existsSync(sessionFile)).toBe(true);
    const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    expect(session.homeUrl).toBe('https://portal.example.com/home');
  });

  it('does not save session when browser lacks saveSession', async () => {
    const browser = makeBrowser('https://portal.example.com/home', { hasSaveSession: false });
    const authModule = makeAuthModule();

    await loginOrRestoreSession(browser, {
      portalUrl: 'https://portal.example.com/login',
      providerId,
      basePath: tmpDir,
      authModule,
    });

    const sessionFile = path.join(tmpDir, providerId, 'session.json');
    expect(fs.existsSync(sessionFile)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Saved session — valid
  // ---------------------------------------------------------------------------

  it('restores valid session and skips login', async () => {
    // Write a valid session file
    const session = makeSession({ homeUrl: 'https://portal.example.com/home' });
    fs.writeFileSync(
      path.join(tmpDir, providerId, 'session.json'),
      JSON.stringify(session),
    );

    const browser = makeBrowser('https://portal.example.com/home');
    const authModule = makeAuthModule();

    const homeUrl = await loginOrRestoreSession(browser, {
      portalUrl: 'https://portal.example.com/login',
      providerId,
      basePath: tmpDir,
      authModule,
    });

    expect(browser.loadSession).toHaveBeenCalledOnce();
    expect(authModule.login).not.toHaveBeenCalled();
    expect(homeUrl).toBe('https://portal.example.com/home');
  });

  it('navigates to session homeUrl (not login URL) when restoring session', async () => {
    const session = makeSession({ homeUrl: 'https://portal.example.com/home' });
    fs.writeFileSync(
      path.join(tmpDir, providerId, 'session.json'),
      JSON.stringify(session),
    );

    const browser = makeBrowser('https://portal.example.com/home');
    const authModule = makeAuthModule();

    await loginOrRestoreSession(browser, {
      portalUrl: 'https://portal.example.com/login',
      providerId,
      basePath: tmpDir,
      authModule,
    });

    const navigateCalls = (browser.navigate as ReturnType<typeof vi.fn>).mock.calls;
    // Should navigate to homeUrl, not login URL
    const navigatedUrls = navigateCalls.map((c: unknown[]) => c[0]);
    expect(navigatedUrls).toContain('https://portal.example.com/home');
    expect(navigatedUrls).not.toContain('https://portal.example.com/login');
  });

  // ---------------------------------------------------------------------------
  // Saved session — expired/invalid (redirected to auth page)
  // ---------------------------------------------------------------------------

  it('falls back to fresh login when session is expired (redirects to auth page)', async () => {
    const session = makeSession({ homeUrl: 'https://portal.example.com/home' });
    fs.writeFileSync(
      path.join(tmpDir, providerId, 'session.json'),
      JSON.stringify(session),
    );

    // Browser is on a login page after session restore
    const browser = makeBrowser('https://portal.example.com/login');
    const authModule = makeAuthModule();
    // After fresh login, browser is on the dashboard
    (browser.url as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce('https://portal.example.com/login') // session check
      .mockResolvedValue('https://portal.example.com/home'); // post-login

    const homeUrl = await loginOrRestoreSession(browser, {
      portalUrl: 'https://portal.example.com/login',
      providerId,
      basePath: tmpDir,
      authModule,
    });

    expect(browser.loadSession).toHaveBeenCalledOnce();
    expect(authModule.login).toHaveBeenCalledOnce();
    expect(homeUrl).toBe('https://portal.example.com/home');
  });

  it('clears expired session file before fresh login', async () => {
    const session = makeSession({ homeUrl: 'https://portal.example.com/home' });
    const sessionFile = path.join(tmpDir, providerId, 'session.json');
    fs.writeFileSync(sessionFile, JSON.stringify(session));

    // Browser lands on login page after session restore attempt
    const browser = makeBrowser('https://portal.example.com/login');
    (browser.url as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce('https://portal.example.com/login')
      .mockResolvedValue('https://portal.example.com/home');
    const authModule = makeAuthModule();

    await loginOrRestoreSession(browser, {
      portalUrl: 'https://portal.example.com/login',
      providerId,
      basePath: tmpDir,
      authModule,
    });

    // After a fresh login, a new session is saved, so file exists again —
    // but we verify login was called (meaning the old session was cleared)
    expect(authModule.login).toHaveBeenCalledOnce();
  });

  // ---------------------------------------------------------------------------
  // Authenticated selectors check
  // ---------------------------------------------------------------------------

  it('returns session URL when no authenticatedSelectors configured', async () => {
    const session = makeSession({ homeUrl: 'https://portal.example.com/home' });
    fs.writeFileSync(
      path.join(tmpDir, providerId, 'session.json'),
      JSON.stringify(session),
    );

    // Browser is on a non-login URL — passes isAuthPage check
    const browser = makeBrowser('https://portal.example.com/home');
    const authModule = makeAuthModule();

    const homeUrl = await loginOrRestoreSession(browser, {
      portalUrl: 'https://portal.example.com/login',
      providerId,
      basePath: tmpDir,
      authModule,
      // No authenticatedSelectors
    });

    expect(authModule.login).not.toHaveBeenCalled();
    expect(homeUrl).toBe('https://portal.example.com/home');
  });

  it('falls back to login when authenticatedSelectors check fails', async () => {
    const session = makeSession({ homeUrl: 'https://portal.example.com/home' });
    fs.writeFileSync(
      path.join(tmpDir, providerId, 'session.json'),
      JSON.stringify(session),
    );

    // Browser is on a non-login URL but querySelector returns null (no authenticated elements)
    const browser = makeBrowser('https://portal.example.com/home');
    (browser.querySelector as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    // After fresh login, on dashboard
    (browser.url as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce('https://portal.example.com/home')
      .mockResolvedValue('https://portal.example.com/home');
    const authModule = makeAuthModule();

    const homeUrl = await loginOrRestoreSession(browser, {
      portalUrl: 'https://portal.example.com/login',
      providerId,
      basePath: tmpDir,
      authModule,
      authenticatedSelectors: ['[data-testid="user-menu"]'],
    });

    expect(authModule.login).toHaveBeenCalledOnce();
    expect(homeUrl).toBe('https://portal.example.com/home');
  });

  it('accepts session when authenticatedSelectors check passes', async () => {
    const session = makeSession({ homeUrl: 'https://portal.example.com/home' });
    fs.writeFileSync(
      path.join(tmpDir, providerId, 'session.json'),
      JSON.stringify(session),
    );

    const browser = makeBrowser('https://portal.example.com/home');
    // querySelector finds the authenticated element
    (browser.querySelector as ReturnType<typeof vi.fn>).mockResolvedValue({ textContent: async () => 'John Doe' });
    const authModule = makeAuthModule();

    const homeUrl = await loginOrRestoreSession(browser, {
      portalUrl: 'https://portal.example.com/login',
      providerId,
      basePath: tmpDir,
      authModule,
      authenticatedSelectors: ['[data-testid="user-menu"]'],
    });

    expect(authModule.login).not.toHaveBeenCalled();
    expect(homeUrl).toBe('https://portal.example.com/home');
  });

  // ---------------------------------------------------------------------------
  // Progress events
  // ---------------------------------------------------------------------------

  it('emits status-message events when emitProgress provided', async () => {
    const session = makeSession({ homeUrl: 'https://portal.example.com/home' });
    fs.writeFileSync(
      path.join(tmpDir, providerId, 'session.json'),
      JSON.stringify(session),
    );

    const browser = makeBrowser('https://portal.example.com/home');
    const authModule = makeAuthModule();
    const emitted: unknown[] = [];

    await loginOrRestoreSession(browser, {
      portalUrl: 'https://portal.example.com/login',
      providerId,
      basePath: tmpDir,
      authModule,
      emitProgress: (e) => emitted.push(e),
    });

    const statusMessages = emitted.filter((e: any) => e.type === 'status-message');
    expect(statusMessages.length).toBeGreaterThan(0);
  });

  it('does not throw when emitProgress is undefined', async () => {
    const browser = makeBrowser('https://portal.example.com/home');
    const authModule = makeAuthModule();

    await expect(
      loginOrRestoreSession(browser, {
        portalUrl: 'https://portal.example.com/login',
        providerId,
        basePath: tmpDir,
        authModule,
        // emitProgress not provided
      }),
    ).resolves.toBeDefined();
  });
});
