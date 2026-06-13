/**
 * Unit tests for nav-map versioning (NAV_MAP_VERSION) in src/discover/nav-map.ts.
 *
 * Verifies:
 * - loadNavMap returns null when file does not exist
 * - loadNavMap returns nav-map as-is when version matches NAV_MAP_VERSION
 * - loadNavMap invalidates cached sections on version mismatch (clears sections,
 *   preserves non-prompt fields like detectedLoginForm)
 * - saveNavMap always stamps NAV_MAP_VERSION into the written file
 * - VERIFY_INSTRUCTIONS for visits rejects upcoming-only pages
 * - buildListInstruction includes date instruction for labs, visits, and messages
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { loadNavMap, saveNavMap, NAV_MAP_VERSION, type NavMap } from '../../src/discover/nav-map.js';
import { VERIFY_INSTRUCTIONS, buildListInstruction } from '../../src/discover/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNavMap(overrides: Partial<NavMap> = {}): NavMap {
  return {
    version: NAV_MAP_VERSION,
    discoveredAt: '2026-01-01T00:00:00.000Z',
    portalName: 'Test Portal',
    sections: {
      labs: {
        steps: ['Find the labs page.'],
        url: 'https://portal.example.com/labs',
        listInstruction: 'Find all lab entries.',
      },
      visits: {
        steps: ['Find the visits page.'],
        url: 'https://portal.example.com/visits',
        listInstruction: 'Find all visit entries.',
      },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: loadNavMap / saveNavMap
// ---------------------------------------------------------------------------

describe('nav-map versioning', () => {
  let tmpDir: string;
  const providerId = 'test-provider';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-map-test-'));
    fs.mkdirSync(path.join(tmpDir, providerId), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeNavMap(data: unknown): void {
    fs.writeFileSync(
      path.join(tmpDir, providerId, 'nav-map.json'),
      JSON.stringify(data),
      'utf8',
    );
  }

  it('returns null when nav-map file does not exist', () => {
    const result = loadNavMap(providerId, tmpDir);
    expect(result).toBeNull();
  });

  it('returns the nav-map when stored version matches NAV_MAP_VERSION', () => {
    const navMap = makeNavMap();
    writeNavMap(navMap);

    const result = loadNavMap(providerId, tmpDir);
    expect(result).not.toBeNull();
    expect(result!.sections.labs?.url).toBe('https://portal.example.com/labs');
    expect(result!.sections.visits?.url).toBe('https://portal.example.com/visits');
    expect(result!.version).toBe(NAV_MAP_VERSION);
  });

  it('invalidates cached sections when stored version is missing (old nav-map)', () => {
    // Simulate a nav-map written before versioning was introduced (no version field)
    const oldNavMap = makeNavMap({ version: undefined });
    writeNavMap(oldNavMap);

    const result = loadNavMap(providerId, tmpDir);
    expect(result).not.toBeNull();
    // Sections should be cleared
    expect(result!.sections).toEqual({});
    // Non-prompt fields should be preserved
    expect(result!.portalName).toBe('Test Portal');
    expect(result!.discoveredAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('invalidates cached sections when stored version is lower than current', () => {
    const staleNavMap = makeNavMap({ version: NAV_MAP_VERSION - 1 });
    writeNavMap(staleNavMap);

    const result = loadNavMap(providerId, tmpDir);
    expect(result).not.toBeNull();
    expect(result!.sections).toEqual({});
  });

  it('invalidates cached sections when stored version is higher than current', () => {
    // Future version — also stale from current code's perspective
    const futureNavMap = makeNavMap({ version: NAV_MAP_VERSION + 1 });
    writeNavMap(futureNavMap);

    const result = loadNavMap(providerId, tmpDir);
    expect(result).not.toBeNull();
    expect(result!.sections).toEqual({});
  });

  it('preserves detectedLoginForm when invalidating on version mismatch', () => {
    const staleNavMap = makeNavMap({
      version: NAV_MAP_VERSION - 1,
      detectedLoginForm: 'two-step',
    });
    writeNavMap(staleNavMap);

    const result = loadNavMap(providerId, tmpDir);
    expect(result).not.toBeNull();
    expect(result!.detectedLoginForm).toBe('two-step');
    expect(result!.sections).toEqual({});
  });

  it('saveNavMap stamps the current NAV_MAP_VERSION into the written file', () => {
    const navMap = makeNavMap({ version: undefined }); // pretend no version
    saveNavMap(navMap, providerId, tmpDir);

    const raw = JSON.parse(
      fs.readFileSync(path.join(tmpDir, providerId, 'nav-map.json'), 'utf8'),
    ) as NavMap;
    expect(raw.version).toBe(NAV_MAP_VERSION);
  });

  it('saveNavMap overwrites an old version with the current NAV_MAP_VERSION', () => {
    const staleNavMap = makeNavMap({ version: 0 });
    saveNavMap(staleNavMap, providerId, tmpDir);

    const raw = JSON.parse(
      fs.readFileSync(path.join(tmpDir, providerId, 'nav-map.json'), 'utf8'),
    ) as NavMap;
    expect(raw.version).toBe(NAV_MAP_VERSION);
  });

  it('round-trip: save then load returns matching version and sections', () => {
    const navMap = makeNavMap();
    saveNavMap(navMap, providerId, tmpDir);

    const loaded = loadNavMap(providerId, tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(NAV_MAP_VERSION);
    expect(loaded!.sections.labs?.url).toBe('https://portal.example.com/labs');
  });
});

// ---------------------------------------------------------------------------
// Tests: VERIFY_INSTRUCTIONS visits verifier
// ---------------------------------------------------------------------------

describe('VERIFY_INSTRUCTIONS — visits', () => {
  it('verifier text rejects upcoming-only pages', () => {
    const instruction = VERIFY_INSTRUCTIONS.visits;
    // The instruction must mention that upcoming-only is NOT acceptable
    expect(instruction.toLowerCase()).toContain('upcoming');
    expect(instruction.toLowerCase()).toContain('not correct');
  });

  it('verifier text accepts empty past visits section', () => {
    const instruction = VERIFY_INSTRUCTIONS.visits;
    // Must accept empty state
    expect(instruction.toLowerCase()).toContain('empty');
  });

  it('verifier text requires past visits, not just any appointments', () => {
    const instruction = VERIFY_INSTRUCTIONS.visits;
    expect(instruction.toLowerCase()).toContain('past');
  });
});

// ---------------------------------------------------------------------------
// Tests: buildListInstruction includes dates
// ---------------------------------------------------------------------------

describe('buildListInstruction — date instructions', () => {
  it('labs instruction includes date', () => {
    const instruction = buildListInstruction('labs');
    expect(instruction.toLowerCase()).toContain('date');
  });

  it('visits instruction includes date and focuses on visit rows', () => {
    const instruction = buildListInstruction('visits');
    expect(instruction.toLowerCase()).toContain('date');
    expect(instruction.toLowerCase()).toContain('visit');
  });

  it('messages instruction includes date', () => {
    const instruction = buildListInstruction('messages');
    expect(instruction.toLowerCase()).toContain('date');
  });

  it('medications instruction exists', () => {
    const instruction = buildListInstruction('medications');
    expect(typeof instruction).toBe('string');
    expect(instruction.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: labs SECTION_INSTRUCTIONS — "My Medical Record" removed
// ---------------------------------------------------------------------------

import { SECTION_INSTRUCTIONS } from '../../src/discover/index.js';

describe('SECTION_INSTRUCTIONS — labs synonyms', () => {
  it('labs instructions no longer mention "My Medical Record"', () => {
    const [primary, fallback] = SECTION_INSTRUCTIONS.labs;
    expect(primary.toLowerCase()).not.toContain('my medical record');
    expect(fallback.toLowerCase()).not.toContain('my medical record');
  });
});

// ---------------------------------------------------------------------------
// Tests: SECTION_INSTRUCTIONS — visits require past tab click
// ---------------------------------------------------------------------------

describe('SECTION_INSTRUCTIONS — visits', () => {
  it('visits instructions mention clicking the Past tab', () => {
    const [primary, fallback] = SECTION_INSTRUCTIONS.visits;
    expect(primary.toLowerCase()).toContain('past');
    expect(fallback.toLowerCase()).toContain('past');
  });

  it('visits instructions mention upcoming appointments scenario', () => {
    const [primary, fallback] = SECTION_INSTRUCTIONS.visits;
    const combined = (primary + ' ' + fallback).toLowerCase();
    expect(combined).toContain('upcoming');
  });
});
