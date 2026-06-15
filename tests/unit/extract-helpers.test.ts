/**
 * Unit tests for src/extract/helpers.ts
 *
 * Covers:
 * - shouldSkipIncremental()
 * - makeVisitFilename() / formatDateSlug()
 * - mergePdfs() (filesystem integration)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  shouldSkipIncremental,
  makeVisitFilename,
  formatDateSlug,
  mergePdfs,
} from '../../src/extract/helpers';

// ---------------------------------------------------------------------------
// formatDateSlug
// ---------------------------------------------------------------------------

describe('formatDateSlug', () => {
  it('formats a January date correctly', () => {
    expect(formatDateSlug(new Date(2024, 0, 5))).toBe('jan-05-2024');
  });

  it('formats a December date with two-digit day', () => {
    expect(formatDateSlug(new Date(2026, 11, 31))).toBe('dec-31-2026');
  });

  it('pads single-digit day with a leading zero', () => {
    expect(formatDateSlug(new Date(2024, 7, 2))).toBe('aug-02-2024');
  });

  it('formats all months correctly', () => {
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    months.forEach((m, i) => {
      expect(formatDateSlug(new Date(2024, i, 1))).toBe(`${m}-01-2024`);
    });
  });
});

// ---------------------------------------------------------------------------
// makeVisitFilename
// ---------------------------------------------------------------------------

describe('makeVisitFilename', () => {
  it('produces a filename with index, description, and date from MM/DD/YYYY', () => {
    const filename = makeVisitFilename(0, 'Office Visit 08/02/2024', 'visit');
    expect(filename).toBe('001_office-visit-aug-02-2024.pdf');
  });

  it('produces a filename with index, description, and date from YYYY-MM-DD', () => {
    const filename = makeVisitFilename(0, 'Annual Physical 2026-01-15', 'visit');
    expect(filename).toBe('001_annual-physical-jan-15-2026.pdf');
  });

  it('falls back to fallbackLabel when description is empty', () => {
    const filename = makeVisitFilename(2, '', 'visit');
    expect(filename).toBe('003_visit.pdf');
  });

  it('uses description as label when no date is found', () => {
    const filename = makeVisitFilename(4, 'Wellness Check', 'fallback');
    expect(filename).toBe('005_wellness-check.pdf');
  });

  it('appends providerId suffix when provided', () => {
    const filename = makeVisitFilename(0, 'Lab Results 04/28/2026', 'lab', '.pdf', 'stanford');
    expect(filename).toBe('001_lab-results-apr-28-2026-stanford.pdf');
  });

  it('uses a custom extension', () => {
    const filename = makeVisitFilename(0, 'Visit 01/01/2024', 'visit', '.txt');
    expect(filename).toBe('001_visit-jan-01-2024.txt');
  });

  it('pads index with zeros to 3 digits', () => {
    expect(makeVisitFilename(9, 'Visit', 'v')).toBe('010_visit.pdf');
    expect(makeVisitFilename(99, 'Visit', 'v')).toBe('100_visit.pdf');
  });

  it('removes date from label slug to avoid duplication', () => {
    // The date "08/02/2024" should appear only as "aug-02-2024", not as "08-02-2024" in the label
    const filename = makeVisitFilename(0, 'Visit 08/02/2024', 'visit');
    expect(filename).not.toContain('08-02-2024');
    expect(filename).toContain('aug-02-2024');
  });
});

// ---------------------------------------------------------------------------
// shouldSkipIncremental
// ---------------------------------------------------------------------------

describe('shouldSkipIncremental', () => {
  it('returns false when cutoff is null (full run)', () => {
    expect(shouldSkipIncremental('Lab CBC 04/28/2026', null)).toBe(false);
  });

  it('returns false when description has no parseable date', () => {
    const cutoff = new Date(2026, 3, 28); // Apr 28, 2026
    expect(shouldSkipIncremental('No date in description', cutoff)).toBe(false);
  });

  it('returns false when item date is empty string', () => {
    const cutoff = new Date(2026, 3, 28);
    expect(shouldSkipIncremental('', cutoff)).toBe(false);
  });

  it('returns true when item date is before the cutoff', () => {
    const cutoff = new Date(2026, 3, 28); // Apr 28, 2026
    expect(shouldSkipIncremental('CBC 04/01/2026', cutoff)).toBe(true);
  });

  it('returns true when item date equals the cutoff (same day)', () => {
    const cutoff = new Date(2026, 3, 28); // Apr 28, 2026
    expect(shouldSkipIncremental('CBC 04/28/2026', cutoff)).toBe(true);
  });

  it('returns false when item date is after the cutoff', () => {
    const cutoff = new Date(2026, 3, 28); // Apr 28, 2026
    expect(shouldSkipIncremental('CBC 05/01/2026', cutoff)).toBe(false);
  });

  it('handles ISO date format in description', () => {
    const cutoff = new Date(2026, 0, 15); // Jan 15, 2026
    expect(shouldSkipIncremental('Annual Physical 2026-01-14', cutoff)).toBe(true);
    expect(shouldSkipIncremental('Annual Physical 2026-01-16', cutoff)).toBe(false);
  });

  it('ignores time component of the cutoff (day-level comparison)', () => {
    // Cutoff is end of day Apr 28
    const cutoff = new Date(2026, 3, 28, 23, 59, 59);
    expect(shouldSkipIncremental('CBC 04/28/2026', cutoff)).toBe(true);
    expect(shouldSkipIncremental('CBC 04/29/2026', cutoff)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mergePdfs — filesystem integration
// ---------------------------------------------------------------------------

// Minimal valid 1-page PDF (hand-crafted, embeds no content — just enough
// for pdf-lib to parse and merge).
const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n' +
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 3 3]>>endobj\n' +
  'xref\n' +
  '0 4\n' +
  '0000000000 65535 f \n' +
  '0000000009 00000 n \n' +
  '0000000058 00000 n \n' +
  '0000000115 00000 n \n' +
  'trailer<</Size 4/Root 1 0 R>>\n' +
  'startxref\n' +
  '190\n' +
  '%%EOF\n',
  'utf8',
);

describe('mergePdfs', () => {
  let tmpDir: string;
  let pdfDir: string;
  let outputPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-pdfs-test-'));
    pdfDir = path.join(tmpDir, 'pdfs');
    fs.mkdirSync(pdfDir);
    outputPath = path.join(tmpDir, 'merged.pdf');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does nothing when the pdf directory contains no PDF files', async () => {
    await mergePdfs(pdfDir, outputPath, 'items');
    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it('creates a merged PDF when the directory contains valid PDFs', async () => {
    fs.writeFileSync(path.join(pdfDir, 'a.pdf'), MINIMAL_PDF);
    fs.writeFileSync(path.join(pdfDir, 'b.pdf'), MINIMAL_PDF);
    await mergePdfs(pdfDir, outputPath, 'items');
    expect(fs.existsSync(outputPath)).toBe(true);
    const mergedBytes = fs.readFileSync(outputPath);
    expect(mergedBytes.length).toBeGreaterThan(0);
    expect(mergedBytes.slice(0, 4).toString()).toBe('%PDF');
  });

  it('skips corrupted PDF files without throwing', async () => {
    fs.writeFileSync(path.join(pdfDir, 'good.pdf'), MINIMAL_PDF);
    fs.writeFileSync(path.join(pdfDir, 'bad.pdf'), Buffer.from('not a pdf'));
    // Should complete without throwing, using only the good file
    await expect(mergePdfs(pdfDir, outputPath, 'items')).resolves.toBeUndefined();
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  it('ignores non-PDF files in the directory', async () => {
    fs.writeFileSync(path.join(pdfDir, 'notes.txt'), 'some text');
    fs.writeFileSync(path.join(pdfDir, 'data.json'), '{}');
    await mergePdfs(pdfDir, outputPath, 'items');
    // No PDFs → no output file created
    expect(fs.existsSync(outputPath)).toBe(false);
  });
});
