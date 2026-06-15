/**
 * Unit tests for src/ipc-types.ts — shared IPC protocol types and TwoFactorError.
 */
import { describe, it, expect } from 'vitest';
import {
  TWO_FACTOR_VALUES,
  LOGIN_FORM_VALUES,
  TwoFactorError,
} from '../../src/ipc-types';

describe('TWO_FACTOR_VALUES', () => {
  it('contains the four expected values', () => {
    expect(TWO_FACTOR_VALUES).toEqual(['none', 'email', 'manual', 'ui']);
  });

  it('is readonly (tuple)', () => {
    // TypeScript enforces this at compile time; this verifies the runtime shape
    expect(Array.isArray(TWO_FACTOR_VALUES)).toBe(true);
    expect(TWO_FACTOR_VALUES).toHaveLength(4);
  });
});

describe('LOGIN_FORM_VALUES', () => {
  it('contains the three expected values', () => {
    expect(LOGIN_FORM_VALUES).toEqual(['two-step', 'single-page', 'auto']);
  });

  it('is readonly (tuple)', () => {
    expect(Array.isArray(LOGIN_FORM_VALUES)).toBe(true);
    expect(LOGIN_FORM_VALUES).toHaveLength(3);
  });
});

describe('TwoFactorError', () => {
  it('is an instance of Error', () => {
    const err = new TwoFactorError('bad code');
    expect(err instanceof Error).toBe(true);
    expect(err instanceof TwoFactorError).toBe(true);
  });

  it('has name TwoFactorError', () => {
    const err = new TwoFactorError('bad code');
    expect(err.name).toBe('TwoFactorError');
  });

  it('preserves the message', () => {
    const err = new TwoFactorError('Code not accepted');
    expect(err.message).toBe('Code not accepted');
  });

  describe('is2FAError', () => {
    it('returns true for TwoFactorError instances', () => {
      expect(TwoFactorError.is2FAError(new TwoFactorError('test'))).toBe(true);
    });

    it('returns true for errors with "2fa" in the message', () => {
      expect(TwoFactorError.is2FAError(new Error('2FA code was rejected'))).toBe(true);
      expect(TwoFactorError.is2FAError(new Error('2FA timed out'))).toBe(true);
    });

    it('returns true for errors with "verification" in the message', () => {
      expect(TwoFactorError.is2FAError(new Error('Verification code expired'))).toBe(true);
    });

    it('returns true for errors with "otp" in the message', () => {
      expect(TwoFactorError.is2FAError(new Error('Invalid OTP entered'))).toBe(true);
    });

    it('returns true for errors with "code not provided" in the message', () => {
      expect(TwoFactorError.is2FAError(new Error('Code not provided'))).toBe(true);
    });

    it('returns true for errors with "cancelled" in the message', () => {
      expect(TwoFactorError.is2FAError(new Error('Operation cancelled by user'))).toBe(true);
    });

    it('is case-insensitive for keyword matching', () => {
      expect(TwoFactorError.is2FAError(new Error('OTP FAILED'))).toBe(true);
      expect(TwoFactorError.is2FAError(new Error('VERIFICATION FAILED'))).toBe(true);
    });

    it('returns false for unrelated errors', () => {
      expect(TwoFactorError.is2FAError(new Error('Network error: ENOTFOUND'))).toBe(false);
      expect(TwoFactorError.is2FAError(new Error('Login failed: wrong password'))).toBe(false);
      expect(TwoFactorError.is2FAError(new Error('Timeout waiting for page'))).toBe(false);
    });

    it('handles non-Error values', () => {
      expect(TwoFactorError.is2FAError('2fa failed')).toBe(true);
      expect(TwoFactorError.is2FAError('network error')).toBe(false);
      expect(TwoFactorError.is2FAError(null)).toBe(false);
      expect(TwoFactorError.is2FAError(undefined)).toBe(false);
      expect(TwoFactorError.is2FAError(42)).toBe(false);
    });
  });
});
