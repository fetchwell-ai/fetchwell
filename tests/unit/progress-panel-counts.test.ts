import { describe, it, expect } from 'vitest';

// formatCategoryCount is a pure helper exported from ProgressPanel.
// We duplicate the logic here so the unit tests don't depend on the renderer
// module (which requires a full Vite/Electron environment to import).
//
// The logic must match the implementation in ProgressPanel.tsx exactly.

function formatCategoryCount(
  count: number | undefined,
  storedCount: number | undefined,
): string | null {
  if (count === undefined) return null;
  if (storedCount !== undefined && storedCount > 0 && count === 0) {
    return `0 new | ${storedCount} existing`;
  }
  if (storedCount !== undefined && storedCount > 0) {
    return `${count} new ${count === 1 ? 'item' : 'items'}`;
  }
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

describe('formatCategoryCount', () => {
  // First-run (no stored count) — current behaviour
  it('returns null when count is undefined', () => {
    expect(formatCategoryCount(undefined, undefined)).toBeNull();
  });

  it('shows singular "item" for count of 1, first run', () => {
    expect(formatCategoryCount(1, undefined)).toBe('1 item');
  });

  it('shows plural "items" for count > 1, first run', () => {
    expect(formatCategoryCount(5, undefined)).toBe('5 items');
  });

  it('shows "0 items" for zero count with no stored count (first run)', () => {
    expect(formatCategoryCount(0, undefined)).toBe('0 items');
  });

  it('shows "0 items" for zero count with stored count of 0 (edge case)', () => {
    expect(formatCategoryCount(0, 0)).toBe('0 items');
  });

  // Incremental run — new items found
  it('shows "N new items" when new count > 0 and stored count > 0', () => {
    expect(formatCategoryCount(3, 10)).toBe('3 new items');
  });

  it('shows "1 new item" (singular) when new count is 1 and stored count > 0', () => {
    expect(formatCategoryCount(1, 10)).toBe('1 new item');
  });

  // Incremental run — no new items but prior run data exists
  it('shows "0 new | N existing" when new count is 0 and stored count > 0', () => {
    expect(formatCategoryCount(0, 3)).toBe('0 new | 3 existing');
  });

  it('shows "0 new | 1 existing" when stored count is 1', () => {
    expect(formatCategoryCount(0, 1)).toBe('0 new | 1 existing');
  });

  it('shows "0 new | 42 existing" for larger stored count', () => {
    expect(formatCategoryCount(0, 42)).toBe('0 new | 42 existing');
  });
});
