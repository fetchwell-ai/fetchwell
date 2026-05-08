import { describe, it, expect } from 'vitest';
import { matchSection, SKIP_PATTERNS } from '../../src/discover/index.js';

// ---------------------------------------------------------------------------
// matchSection tests
// ---------------------------------------------------------------------------

describe('matchSection', () => {
  it('matches "Procedures" to labs', () => {
    expect(matchSection('Procedures')).toBe('labs');
  });

  it('matches "imaging studies" to labs', () => {
    expect(matchSection('View your imaging studies and radiology reports')).toBe('labs');
  });

  it('does NOT match bare "results" to labs', () => {
    // "results" was removed from SECTION_KEYWORDS.labs because it is too generic
    expect(matchSection('Search Results')).toBeNull();
    expect(matchSection('No results found')).toBeNull();
  });

  it('matches "test results" to labs', () => {
    expect(matchSection('View your test results')).toBe('labs');
  });

  it('matches "lab results" to labs', () => {
    expect(matchSection('Recent lab results')).toBe('labs');
  });

  it('does NOT match "Compose a message" to messages', () => {
    // "compose" was removed from messages keywords — it is a button label, not a section
    expect(matchSection('Compose a message')).toBeNull();
  });

  it('matches "encounters" to visits', () => {
    expect(matchSection('Recent encounters')).toBe('visits');
  });

  it('matches "reports" to labs', () => {
    expect(matchSection('View your reports')).toBe('labs');
  });
});

// ---------------------------------------------------------------------------
// SKIP_PATTERNS tests
// ---------------------------------------------------------------------------

describe('SKIP_PATTERNS', () => {
  it('does NOT contain "medical records"', () => {
    // "medical records" was removed — some portals use "My Medical Record" as a parent nav item
    expect(SKIP_PATTERNS).not.toContain('medical records');
  });

  it('does NOT contain "procedures"', () => {
    // "procedures" was removed — on many Epic portals it contains imaging/radiology/lab results
    expect(SKIP_PATTERNS).not.toContain('procedures');
  });

  it('"My Medical Record" is NOT skipped', () => {
    const label = 'My Medical Record';
    const lower = label.toLowerCase();
    const isSkipped = SKIP_PATTERNS.some((p) => lower.includes(p));
    expect(isSkipped).toBe(false);
  });
});
