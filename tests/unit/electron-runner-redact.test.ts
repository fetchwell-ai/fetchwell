/**
 * Unit tests for the redact() function exported from src/electron-runner.ts.
 *
 * Covers URL redaction (full portal URLs → hostname token) and item description
 * redaction (extract progress lines) to prevent PHI from persisting to log files.
 */
import { describe, it, expect } from 'vitest';
import { redact } from '../../src/electron-runner';

describe('redact — URL redaction', () => {
  it('replaces a full https URL with [portal:<hostname>]', () => {
    const line = '[2fa] Login complete — URL: https://mychart.ucsf.edu/MyChart/Authentication/Login';
    expect(redact(line)).toBe('[2fa] Login complete — URL: [portal:mychart.ucsf.edu]');
  });

  it('replaces an http URL with [portal:<hostname>]', () => {
    const line = 'Navigating to http://example.com/some/path';
    expect(redact(line)).toBe('Navigating to [portal:example.com]');
  });

  it('replaces multiple URLs in a single line', () => {
    const line = 'Redirect from https://a.com/login to https://b.com/home';
    expect(redact(line)).toBe('Redirect from [portal:a.com] to [portal:b.com]');
  });

  it('leaves a line with no URL unchanged', () => {
    const line = '[session] Saved session expired (>12h). Will log in fresh.';
    expect(redact(line)).toBe(line);
  });

  it('preserves the hostname in the token', () => {
    const line = 'URL: https://myhealth.stanford.edu/MyChart/inside.asp?mode=records';
    expect(redact(line)).toBe('URL: [portal:myhealth.stanford.edu]');
  });
});

describe('redact — item description redaction', () => {
  it('redacts description in a lab result progress line', () => {
    const line = '[extract] Doc 3/12: CBC with Differential 2024-01-15';
    expect(redact(line)).toBe('[extract] Doc 3/12: [redacted]');
  });

  it('redacts description in first item (1/N)', () => {
    const line = '[extract] Doc 1/5: Comprehensive Metabolic Panel';
    expect(redact(line)).toBe('[extract] Doc 1/5: [redacted]');
  });

  it('redacts description in visit/message lines', () => {
    const line = '[extract] Visit 2/8: Office Visit - Primary Care 2023-11-10';
    expect(redact(line)).toBe('[extract] Visit 2/8: [redacted]');
  });

  it('leaves non-extract lines unchanged', () => {
    const line = '[session] Loaded cookies — 12 entries';
    expect(redact(line)).toBe(line);
  });

  it('leaves already-skipping lines unchanged (no colon-space description)', () => {
    const line = '[extract] Doc 3/12: already saved — skipping';
    expect(redact(line)).toBe('[extract] Doc 3/12: [redacted]');
  });
});

describe('redact — combined', () => {
  it('redacts both a URL and a description in the same line', () => {
    const line = '[extract] Doc 1/1: https://mychart.ucsf.edu/record/123 Lab Result Name';
    // URL gets replaced first; then the description portion is redacted
    expect(redact(line)).toBe('[extract] Doc 1/1: [redacted]');
  });
});
