import { describe, it, expect } from 'vitest';
import { validatePortalUrl } from '../../src/renderer/lib/utils';

describe('validatePortalUrl', () => {
  it('returns false for an empty string', () => {
    expect(validatePortalUrl('')).toBe(false);
  });

  it('returns false for a whitespace-only string', () => {
    expect(validatePortalUrl('   ')).toBe(false);
  });

  it('returns false for plain text without a protocol', () => {
    expect(validatePortalUrl('not-a-url')).toBe(false);
  });

  it('returns false for text with no TLD-like structure', () => {
    expect(validatePortalUrl('mychart')).toBe(false);
  });

  it('returns true for a valid https URL', () => {
    expect(validatePortalUrl('https://mychart.example.org/MyChart')).toBe(true);
  });

  it('returns true for a valid http URL', () => {
    expect(validatePortalUrl('http://portal.hospital.com')).toBe(true);
  });

  it('returns true for a URL with a path and query string', () => {
    expect(validatePortalUrl('https://mychart.example.org/MyChart?foo=bar')).toBe(true);
  });

  it('returns false for a ftp:// URL', () => {
    expect(validatePortalUrl('ftp://files.example.com')).toBe(false);
  });

  it('returns false for a URL with only a protocol', () => {
    expect(validatePortalUrl('https://')).toBe(false);
  });

  it('trims whitespace before validating', () => {
    expect(validatePortalUrl('  https://mychart.example.org  ')).toBe(true);
  });

  it('returns false for javascript: protocol', () => {
    expect(validatePortalUrl('javascript:alert(1)')).toBe(false);
  });
});
