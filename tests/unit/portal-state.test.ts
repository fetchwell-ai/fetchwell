import { describe, it, expect } from 'vitest';

/**
 * Tests the portal state derivation logic used by PortalCard.
 * Mirrors the production derivePortalState from PortalList.tsx.
 */

type PortalState = 'ready' | 'fetched';

interface PortalLike {
  lastExtractedAt: string | null;
}

function derivePortalState(portal: PortalLike): PortalState {
  if (portal.lastExtractedAt !== null) return 'fetched';
  return 'ready';
}

describe('derivePortalState', () => {
  it('returns "ready" when lastExtractedAt is null', () => {
    expect(derivePortalState({ lastExtractedAt: null })).toBe('ready');
  });

  it('returns "fetched" when lastExtractedAt is set', () => {
    expect(derivePortalState({ lastExtractedAt: '2026-05-08' })).toBe('fetched');
  });
});
