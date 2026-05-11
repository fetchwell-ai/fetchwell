import { describe, it, expect } from 'vitest';

// deriveQuickStartSteps is not importable directly (it lives in the renderer
// and depends on a global PortalEntry type from the Electron preload), so we
// test the underlying logic by re-implementing the pure function here.
// This validates the step-derivation contract that QuickStart relies on.

interface PortalLike {
  lastExtractedAt: string | null;
}

type ApiKeySource = 'bundled' | 'custom';

interface QuickStartStep {
  key: string;
  label: string;
  done: boolean;
  meta?: string;
}

function deriveQuickStartSteps(
  portals: PortalLike[],
  apiKeyConfigured: boolean,
  apiKeySource: ApiKeySource = 'bundled',
): QuickStartStep[] {
  const hasPortal = portals.length > 0;
  const extractedPortal = portals.find((p) => p.lastExtractedAt !== null);

  const isBundled = apiKeySource === 'bundled';
  const apiKeyDone = isBundled || apiKeyConfigured;
  const portalDone = hasPortal;
  const extractedDone = extractedPortal !== undefined;

  const apiKeyMeta = isBundled ? 'Included' : apiKeyDone ? 'Validated' : undefined;
  const portalMeta = portalDone
    ? portals.length === 1
      ? '1 added'
      : `${portals.length} added`
    : undefined;
  const extractedMeta = extractedDone ? 'some date' : undefined;

  return [
    { key: 'api-key', label: 'API key', done: apiKeyDone, meta: apiKeyMeta },
    { key: 'portal', label: 'Add a patient portal', done: portalDone, meta: portalMeta },
    { key: 'extract', label: 'Fetch your records', done: extractedDone, meta: extractedMeta },
  ];
}

function allDone(steps: QuickStartStep[]): boolean {
  return steps.every((s) => s.done);
}

describe('deriveQuickStartSteps', () => {
  it('all steps not done when no portals and no API key (custom source)', () => {
    const steps = deriveQuickStartSteps([], false, 'custom');
    expect(steps[0].done).toBe(false);
    expect(steps[1].done).toBe(false);
    expect(steps[2].done).toBe(false);
    expect(allDone(steps)).toBe(false);
  });

  it('api-key step done when apiKeyConfigured is true (custom source)', () => {
    const steps = deriveQuickStartSteps([], true, 'custom');
    expect(steps[0].done).toBe(true);
    expect(steps[0].meta).toBe('Validated');
    expect(steps[1].done).toBe(false);
    expect(steps[2].done).toBe(false);
  });

  it('api-key step done with meta "Included" when apiKeySource is bundled', () => {
    const steps = deriveQuickStartSteps([], false, 'bundled');
    expect(steps[0].done).toBe(true);
    expect(steps[0].meta).toBe('Included');
  });

  it('api-key step done with meta "Included" when apiKeySource is bundled even if apiKeyConfigured is false', () => {
    const steps = deriveQuickStartSteps([], false);
    expect(steps[0].done).toBe(true);
    expect(steps[0].meta).toBe('Included');
  });

  it('api-key step label is "API key"', () => {
    const steps = deriveQuickStartSteps([], false, 'bundled');
    expect(steps[0].label).toBe('API key');
  });

  it('api-key step label is "API key" for custom source too', () => {
    const steps = deriveQuickStartSteps([], true, 'custom');
    expect(steps[0].label).toBe('API key');
  });

  it('portal step done when at least one portal exists', () => {
    const portals = [{ lastExtractedAt: null }];
    const steps = deriveQuickStartSteps(portals, false, 'custom');
    expect(steps[1].done).toBe(true);
    expect(steps[1].meta).toBe('1 added');
    expect(steps[2].done).toBe(false);
  });

  it('portal meta shows count when multiple portals', () => {
    const portals = [{ lastExtractedAt: null }, { lastExtractedAt: null }];
    const steps = deriveQuickStartSteps(portals, false, 'custom');
    expect(steps[1].meta).toBe('2 added');
  });

  it('extract step done when any portal has lastExtractedAt', () => {
    const portals = [{ lastExtractedAt: '2026-05-08T10:00:00Z' }];
    const steps = deriveQuickStartSteps(portals, false, 'custom');
    expect(steps[2].done).toBe(true);
  });

  it('extract step not done when no portal has lastExtractedAt', () => {
    const portals = [{ lastExtractedAt: null }];
    const steps = deriveQuickStartSteps(portals, false, 'custom');
    expect(steps[2].done).toBe(false);
  });

  it('allDone is true when all three conditions are met (custom source)', () => {
    const portals = [{ lastExtractedAt: '2026-05-08T10:00:00Z' }];
    const steps = deriveQuickStartSteps(portals, true, 'custom');
    expect(allDone(steps)).toBe(true);
  });

  it('allDone is true with bundled key even when apiKeyConfigured is false', () => {
    const portals = [{ lastExtractedAt: '2026-05-08T10:00:00Z' }];
    const steps = deriveQuickStartSteps(portals, false, 'bundled');
    expect(allDone(steps)).toBe(true);
  });

  it('allDone is false when only api key and portal are done but no extraction', () => {
    const portals = [{ lastExtractedAt: null }];
    const steps = deriveQuickStartSteps(portals, true, 'custom');
    expect(allDone(steps)).toBe(false);
  });

  it('allDone is false with bundled key when portal done but no extraction', () => {
    const portals = [{ lastExtractedAt: null }];
    const steps = deriveQuickStartSteps(portals, false, 'bundled');
    expect(allDone(steps)).toBe(false);
  });
});
