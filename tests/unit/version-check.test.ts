import { describe, it, expect } from 'vitest';
import { isVersionBelow } from '../../electron/version-check';

describe('isVersionBelow', () => {
  it('returns false when current equals minimum', () => {
    expect(isVersionBelow('1.0.0', '1.0.0')).toBe(false);
  });

  it('returns true when current major is below minimum', () => {
    expect(isVersionBelow('0.9.0', '1.0.0')).toBe(true);
  });

  it('returns false when current major is above minimum', () => {
    expect(isVersionBelow('2.0.0', '1.0.0')).toBe(false);
  });

  it('returns true when current minor is below minimum', () => {
    expect(isVersionBelow('1.0.0', '1.1.0')).toBe(true);
  });

  it('returns false when current minor is above minimum', () => {
    expect(isVersionBelow('1.2.0', '1.1.0')).toBe(false);
  });

  it('returns true when current patch is below minimum', () => {
    expect(isVersionBelow('1.0.0', '1.0.1')).toBe(true);
  });

  it('returns false when current patch is above minimum', () => {
    expect(isVersionBelow('1.0.2', '1.0.1')).toBe(false);
  });

  it('returns false when current version is well above minimum', () => {
    expect(isVersionBelow('2.5.3', '1.0.0')).toBe(false);
  });

  it('returns true for 0.0.9 below 0.1.0', () => {
    expect(isVersionBelow('0.0.9', '0.1.0')).toBe(true);
  });

  it('returns false for 0.1.0 against 0.1.0 (the initial gate version)', () => {
    expect(isVersionBelow('0.1.0', '0.1.0')).toBe(false);
  });

  it('handles missing patch component gracefully (treats as 0)', () => {
    expect(isVersionBelow('1.0', '1.0.1')).toBe(true);
  });
});
