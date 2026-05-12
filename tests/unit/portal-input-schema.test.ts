/**
 * Unit tests for PortalInputSchema — validates IPC input for addPortal and updatePortal.
 */
import { describe, it, expect } from 'vitest';
import { PortalInputSchema } from '../../electron/config';

describe('PortalInputSchema (full parse — addPortal)', () => {
  it('accepts a minimal valid input', () => {
    const result = PortalInputSchema.parse({
      name: 'My Clinic',
      url: 'https://myclinic.example.com',
      twoFactor: 'none',
    });
    expect(result.name).toBe('My Clinic');
    expect(result.url).toBe('https://myclinic.example.com');
    expect(result.twoFactor).toBe('none');
    expect(result.loginForm).toBeUndefined();
    expect(result.username).toBeUndefined();
    expect(result.password).toBeUndefined();
  });

  it('accepts all fields', () => {
    const result = PortalInputSchema.parse({
      name: 'Stanford Health',
      url: 'https://myhealth.stanfordhealthcare.org',
      loginForm: 'two-step',
      twoFactor: 'email',
      username: 'user@example.com',
      password: 'secret123',
    });
    expect(result.loginForm).toBe('two-step');
    expect(result.twoFactor).toBe('email');
    expect(result.username).toBe('user@example.com');
    expect(result.password).toBe('secret123');
  });

  it('accepts all valid loginForm values', () => {
    for (const loginForm of ['two-step', 'single-page', 'auto'] as const) {
      const result = PortalInputSchema.parse({
        name: 'Test',
        url: 'https://test.com',
        loginForm,
        twoFactor: 'none',
      });
      expect(result.loginForm).toBe(loginForm);
    }
  });

  it('accepts all valid twoFactor values', () => {
    for (const twoFactor of ['none', 'email', 'manual', 'ui'] as const) {
      const result = PortalInputSchema.parse({
        name: 'Test',
        url: 'https://test.com',
        twoFactor,
      });
      expect(result.twoFactor).toBe(twoFactor);
    }
  });

  it('rejects when name is missing', () => {
    expect(() =>
      PortalInputSchema.parse({
        url: 'https://test.com',
        twoFactor: 'none',
      }),
    ).toThrow();
  });

  it('rejects when name is empty string', () => {
    expect(() =>
      PortalInputSchema.parse({
        name: '',
        url: 'https://test.com',
        twoFactor: 'none',
      }),
    ).toThrow(/empty/i);
  });

  it('rejects when url is missing', () => {
    expect(() =>
      PortalInputSchema.parse({
        name: 'Test',
        twoFactor: 'none',
      }),
    ).toThrow();
  });

  it('rejects when url is empty string', () => {
    expect(() =>
      PortalInputSchema.parse({
        name: 'Test',
        url: '',
        twoFactor: 'none',
      }),
    ).toThrow(/empty/i);
  });

  it('rejects when twoFactor is missing', () => {
    expect(() =>
      PortalInputSchema.parse({
        name: 'Test',
        url: 'https://test.com',
      }),
    ).toThrow();
  });

  it('rejects an invalid twoFactor value', () => {
    expect(() =>
      PortalInputSchema.parse({
        name: 'Test',
        url: 'https://test.com',
        twoFactor: 'sms',
      }),
    ).toThrow();
  });

  it('rejects an invalid loginForm value', () => {
    expect(() =>
      PortalInputSchema.parse({
        name: 'Test',
        url: 'https://test.com',
        loginForm: 'magic-link',
        twoFactor: 'none',
      }),
    ).toThrow();
  });

  it('rejects non-object input', () => {
    expect(() => PortalInputSchema.parse(null)).toThrow();
    expect(() => PortalInputSchema.parse('string')).toThrow();
    expect(() => PortalInputSchema.parse(42)).toThrow();
  });
});

describe('PortalInputSchema.partial() (updatePortal)', () => {
  const PartialSchema = PortalInputSchema.partial();

  it('accepts an empty object (no fields required)', () => {
    const result = PartialSchema.parse({});
    expect(result).toEqual({});
  });

  it('accepts a url-only update', () => {
    const result = PartialSchema.parse({ url: 'https://new.example.com' });
    expect(result.url).toBe('https://new.example.com');
  });

  it('accepts a twoFactor-only update', () => {
    const result = PartialSchema.parse({ twoFactor: 'manual' });
    expect(result.twoFactor).toBe('manual');
  });

  it('accepts a partial update with name and url', () => {
    const result = PartialSchema.parse({ name: 'New Name', url: 'https://new.com' });
    expect(result.name).toBe('New Name');
    expect(result.url).toBe('https://new.com');
  });

  it('still rejects an invalid twoFactor value in partial mode', () => {
    expect(() =>
      PartialSchema.parse({ twoFactor: 'unknown' }),
    ).toThrow();
  });

  it('still rejects an empty name in partial mode', () => {
    expect(() =>
      PartialSchema.parse({ name: '' }),
    ).toThrow(/empty/i);
  });

  it('still rejects an invalid loginForm value in partial mode', () => {
    expect(() =>
      PartialSchema.parse({ loginForm: 'otp' }),
    ).toThrow();
  });

  it('rejects non-object input', () => {
    expect(() => PartialSchema.parse(null)).toThrow();
    expect(() => PartialSchema.parse(undefined)).toThrow();
  });
});
