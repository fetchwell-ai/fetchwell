import { describe, it, expect } from 'vitest';
import { categorizeError } from '../../electron/error-categorize';

describe('categorizeError', () => {
  describe('credentials category', () => {
    it('matches "credentials" keyword', () => {
      const result = categorizeError('Invalid credentials provided');
      expect(result.category).toBe('credentials');
    });

    it('matches "login failed" keyword', () => {
      const result = categorizeError('Login failed: wrong password');
      expect(result.category).toBe('credentials');
    });

    it('is case-insensitive for credentials', () => {
      const result = categorizeError('INVALID CREDENTIALS');
      expect(result.category).toBe('credentials');
      expect(result.suggestion).toContain('username and password');
    });
  });

  describe('2fa_timeout category', () => {
    it('matches "2fa" keyword', () => {
      const result = categorizeError('2FA code not received');
      expect(result.category).toBe('2fa_timeout');
    });

    it('matches "timed out" keyword', () => {
      const result = categorizeError('Operation timed out waiting for OTP');
      expect(result.category).toBe('2fa_timeout');
    });

    it('matches "cancelled" keyword (user dismissed 2FA modal)', () => {
      const result = categorizeError('2FA code not provided — user may have timed out or cancelled');
      expect(result.category).toBe('2fa_timeout');
    });

    it('is case-insensitive for 2fa', () => {
      const result = categorizeError('2FA REQUIRED');
      expect(result.category).toBe('2fa_timeout');
      expect(result.suggestion).toContain('try again');
    });

    it('suggestion is Verification timed out message', () => {
      const result = categorizeError('2FA verification failed');
      expect(result.suggestion).toBe('Verification timed out — try again');
    });
  });

  describe('network category', () => {
    it('matches "enotfound" keyword', () => {
      const result = categorizeError('getaddrinfo ENOTFOUND example.com');
      expect(result.category).toBe('network');
    });

    it('matches "econnrefused" keyword', () => {
      const result = categorizeError('connect ECONNREFUSED 127.0.0.1:3000');
      expect(result.category).toBe('network');
    });

    it('is case-insensitive for network errors', () => {
      const result = categorizeError('ENOTFOUND dns lookup failed');
      expect(result.category).toBe('network');
      expect(result.suggestion).toContain('internet connection');
    });
  });

  describe('portal_structure category', () => {
    it('matches "nav-map" keyword', () => {
      const result = categorizeError('nav-map.json not found for this portal');
      expect(result.category).toBe('portal_structure');
    });

    it('matches "not found" keyword', () => {
      const result = categorizeError('Page element not found');
      expect(result.category).toBe('portal_structure');
    });

    it('is case-insensitive for portal_structure errors', () => {
      const result = categorizeError('NAV-MAP missing');
      expect(result.category).toBe('portal_structure');
      expect(result.suggestion).toContain('re-running Map');
    });
  });

  describe('unknown category', () => {
    it('returns unknown for unrecognized error messages', () => {
      const result = categorizeError('Something completely unexpected happened');
      expect(result.category).toBe('unknown');
    });

    it('returns a suggestion for unknown errors', () => {
      const result = categorizeError('Random error');
      expect(result.suggestion).toContain('unexpected error');
    });

    it('returns unknown for empty message', () => {
      const result = categorizeError('');
      expect(result.category).toBe('unknown');
    });
  });
});
