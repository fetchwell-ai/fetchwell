/**
 * Unit tests for src/auth/shared.ts — isAuthPage()
 */

import { describe, it, expect } from 'vitest';
import { isAuthPage } from '../../src/auth/shared';

describe('isAuthPage', () => {
  // ---------------------------------------------------------------------------
  // Auth page URLs — should return true
  // ---------------------------------------------------------------------------

  it('returns true for a URL with /login in the path', () => {
    expect(isAuthPage('https://portal.example.com/login')).toBe(true);
  });

  it('returns true for a URL with /Login (case-insensitive)', () => {
    expect(isAuthPage('https://portal.example.com/Login')).toBe(true);
  });

  it('returns true for a URL with /auth in the path', () => {
    expect(isAuthPage('https://portal.example.com/auth/callback')).toBe(true);
  });

  it('returns true for a URL with /sign-in in the path', () => {
    expect(isAuthPage('https://portal.example.com/sign-in')).toBe(true);
  });

  it('returns true for a URL with /signin in the path', () => {
    expect(isAuthPage('https://portal.example.com/signin')).toBe(true);
  });

  it('returns true for a URL containing "authentication"', () => {
    expect(isAuthPage('https://portal.example.com/UCSFMyChart/Authentication/Login')).toBe(true);
  });

  it('returns true for a URL containing "twofactor"', () => {
    expect(isAuthPage('https://portal.example.com/twofactor')).toBe(true);
  });

  it('returns true for a URL containing "verif"', () => {
    expect(isAuthPage('https://portal.example.com/verify-identity')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Non-auth page URLs — should return false
  // ---------------------------------------------------------------------------

  it('returns false for a dashboard/home URL', () => {
    expect(isAuthPage('https://portal.example.com/home')).toBe(false);
  });

  it('returns false for a health records URL', () => {
    expect(isAuthPage('https://portal.example.com/MyChart/Health')).toBe(false);
  });

  it('returns false for a URL with "login" only in the query string', () => {
    // The OnemedIcal pattern: callback URL with ?iss=https://login.example.com
    expect(isAuthPage('https://app.onemedical.com/?iss=https://login.example.com/')).toBe(false);
  });

  it('returns false for a URL with "login" only in the domain', () => {
    // Domain contains "login" but pathname does not
    expect(isAuthPage('https://login.example.com/dashboard')).toBe(false);
  });

  it('returns false for a labs/appointments URL', () => {
    expect(isAuthPage('https://portal.example.com/MyChart/Labs')).toBe(false);
  });

  it('returns false for an empty string (falls back to lowercase check — no auth keywords)', () => {
    expect(isAuthPage('')).toBe(false);
  });

  it('handles a malformed URL gracefully (falls back to lowercase string match)', () => {
    // Not a valid URL — falls back to url.toLowerCase()
    expect(isAuthPage('not-a-url-login-path')).toBe(true);
  });
});
