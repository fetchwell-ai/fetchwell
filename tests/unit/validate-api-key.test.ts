import { describe, it, expect } from 'vitest';
import { validateApiKeyFormat } from '../../electron/credentials';

describe('validateApiKeyFormat', () => {
  it('returns true for a valid Anthropic API key', () => {
    expect(validateApiKeyFormat('sk-ant-api03-someverylongkeyvalue')).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(validateApiKeyFormat('')).toBe(false);
  });

  it('returns false for wrong prefix', () => {
    expect(validateApiKeyFormat('sk-openai-somekeyvalue')).toBe(false);
  });

  it('returns false for a key that is too short (just the prefix)', () => {
    // length of 'sk-ant-' is 7, which is not > 10
    expect(validateApiKeyFormat('sk-ant-')).toBe(false);
  });

  it('returns false for a key that is slightly too short', () => {
    // 'sk-ant-ab' is 9 chars, not > 10
    expect(validateApiKeyFormat('sk-ant-ab')).toBe(false);
  });

  it('returns true for a key that is exactly 11 chars with the right prefix', () => {
    expect(validateApiKeyFormat('sk-ant-abcd')).toBe(true);
  });

  it('trims whitespace before checking', () => {
    expect(validateApiKeyFormat('  sk-ant-api03-longkeyvalue  ')).toBe(true);
  });
});
