/**
 * Unit tests for src/session.ts — loadSavedSession() Zod validation.
 *
 * Covers valid session data, corrupted/invalid data (returns null), and
 * the 12h expiry path.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadSavedSession, saveSession } from '../../src/session';

function validSessionData(overrides: Record<string, unknown> = {}) {
  return {
    cookies: [
      {
        name: 'session',
        value: 'abc123',
        domain: 'portal.example.com',
        path: '/',
        expires: Date.now() / 1000 + 3600,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      },
    ],
    savedAt: new Date().toISOString(),
    homeUrl: 'https://portal.example.com/home',
    ...overrides,
  };
}

describe('loadSavedSession — Zod validation', () => {
  let tmpDir: string;
  let providerId: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-test-'));
    providerId = 'test-provider';
    fs.mkdirSync(path.join(tmpDir, providerId), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeSession(data: unknown) {
    fs.writeFileSync(
      path.join(tmpDir, providerId, 'session.json'),
      JSON.stringify(data),
      'utf8',
    );
  }

  // ---------------------------------------------------------------------------
  // Valid data
  // ---------------------------------------------------------------------------

  it('returns a valid session when data matches the schema', () => {
    writeSession(validSessionData());
    const session = loadSavedSession(providerId, tmpDir);
    expect(session).not.toBeNull();
    expect(session?.savedAt).toBeDefined();
    expect(session?.cookies).toHaveLength(1);
    expect(session?.homeUrl).toBe('https://portal.example.com/home');
  });

  it('returns a valid session without optional homeUrl', () => {
    const data = validSessionData();
    delete (data as Record<string, unknown>).homeUrl;
    writeSession(data);
    const session = loadSavedSession(providerId, tmpDir);
    expect(session).not.toBeNull();
    expect(session?.homeUrl).toBeUndefined();
  });

  it('returns a valid session without optional sameSite on cookie', () => {
    const data = validSessionData();
    delete (data.cookies[0] as Record<string, unknown>).sameSite;
    writeSession(data);
    const session = loadSavedSession(providerId, tmpDir);
    expect(session).not.toBeNull();
    expect(session?.cookies[0].sameSite).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Corrupted / invalid data — must return null
  // ---------------------------------------------------------------------------

  it('returns null when session file contains non-JSON text', () => {
    fs.writeFileSync(
      path.join(tmpDir, providerId, 'session.json'),
      'not valid json!!!',
      'utf8',
    );
    expect(loadSavedSession(providerId, tmpDir)).toBeNull();
  });

  it('returns null when session file is an empty object', () => {
    writeSession({});
    expect(loadSavedSession(providerId, tmpDir)).toBeNull();
  });

  it('returns null when cookies field is missing', () => {
    const { cookies: _cookies, ...rest } = validSessionData();
    writeSession(rest);
    expect(loadSavedSession(providerId, tmpDir)).toBeNull();
  });

  it('returns null when savedAt field is missing', () => {
    const { savedAt: _savedAt, ...rest } = validSessionData();
    writeSession(rest);
    expect(loadSavedSession(providerId, tmpDir)).toBeNull();
  });

  it('returns null when cookies is not an array', () => {
    writeSession({ ...validSessionData(), cookies: 'not-an-array' });
    expect(loadSavedSession(providerId, tmpDir)).toBeNull();
  });

  it('returns null when a cookie is missing required fields', () => {
    writeSession({
      ...validSessionData(),
      cookies: [{ name: 'session', value: 'abc' }], // missing domain, path, expires, etc.
    });
    expect(loadSavedSession(providerId, tmpDir)).toBeNull();
  });

  it('returns null when savedAt is not a string', () => {
    writeSession({ ...validSessionData(), savedAt: 12345 });
    expect(loadSavedSession(providerId, tmpDir)).toBeNull();
  });

  it('returns null when root value is an array', () => {
    writeSession([validSessionData()]);
    expect(loadSavedSession(providerId, tmpDir)).toBeNull();
  });

  it('returns null when root value is null', () => {
    writeSession(null);
    expect(loadSavedSession(providerId, tmpDir)).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Expiry path
  // ---------------------------------------------------------------------------

  it('returns null and deletes file when session is older than 12h', () => {
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString();
    writeSession(validSessionData({ savedAt: thirteenHoursAgo }));
    const sessionFile = path.join(tmpDir, providerId, 'session.json');
    expect(fs.existsSync(sessionFile)).toBe(true);

    const session = loadSavedSession(providerId, tmpDir);
    expect(session).toBeNull();
    expect(fs.existsSync(sessionFile)).toBe(false);
  });

  it('returns null when no session file exists', () => {
    expect(loadSavedSession(providerId, tmpDir)).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // saveSession round-trip
  // ---------------------------------------------------------------------------

  it('saveSession + loadSavedSession round-trips correctly', () => {
    const original = {
      cookies: [
        {
          name: 'token',
          value: 'xyz',
          domain: 'example.com',
          path: '/',
          expires: Date.now() / 1000 + 7200,
          httpOnly: false,
          secure: true,
        },
      ],
      savedAt: new Date().toISOString(),
      homeUrl: 'https://example.com/dashboard',
    };

    saveSession(original, providerId, tmpDir);
    const loaded = loadSavedSession(providerId, tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded?.homeUrl).toBe('https://example.com/dashboard');
    expect(loaded?.cookies[0].name).toBe('token');
  });

  it('saveSession writes session.json with mode 0o600', () => {
    const session = {
      cookies: [],
      savedAt: new Date().toISOString(),
    };
    saveSession(session, providerId, tmpDir);
    const filePath = path.join(tmpDir, providerId, 'session.json');
    const stat = fs.statSync(filePath);
    // Extract the permission bits (last 9 bits)
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('saveSession creates the session directory with mode 0o700', () => {
    const newProviderId = 'new-provider-permissions';
    const session = {
      cookies: [],
      savedAt: new Date().toISOString(),
    };
    saveSession(session, newProviderId, tmpDir);
    const dirPath = path.join(tmpDir, newProviderId);
    const stat = fs.statSync(dirPath);
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o700);
  });
});
