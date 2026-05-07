import { describe, it, expect } from 'vitest';
import { slugify } from '../../electron/config';

describe('slugify', () => {
  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('converts spaces to hyphens', () => {
    expect(slugify('My Portal')).toBe('my-portal');
  });

  it('lowercases the result', () => {
    expect(slugify('ACME HEALTH')).toBe('acme-health');
  });

  it('removes special characters', () => {
    expect(slugify('Dr. Smith\'s Portal!')).toBe('dr-smith-s-portal');
  });

  it('collapses multiple spaces/special chars to a single hyphen', () => {
    expect(slugify('My  Portal  Name')).toBe('my-portal-name');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugify('  My Portal  ')).toBe('my-portal');
  });

  it('strips leading hyphens from special-char prefix', () => {
    expect(slugify('---portal')).toBe('portal');
  });

  it('handles already-slugified input without modification', () => {
    expect(slugify('my-portal-123')).toBe('my-portal-123');
  });

  it('handles numbers correctly', () => {
    expect(slugify('Provider 2')).toBe('provider-2');
  });

  it('handles a string that is only special chars', () => {
    expect(slugify('!!!')).toBe('');
  });
});
