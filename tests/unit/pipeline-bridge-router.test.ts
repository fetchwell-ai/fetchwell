/**
 * Unit tests for routeChildMessage() in electron/pipeline-bridge.ts.
 *
 * routeChildMessage() is a pure function — it maps raw IPC messages from
 * the child process to typed handler callbacks. Tests run without an Electron
 * environment by mocking the 'electron' and 'child_process' modules.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before any imports so vitest hoists them
// ---------------------------------------------------------------------------

vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: vi.fn(),
  ipcMain: { on: vi.fn() },
}));

vi.mock('child_process', () => ({
  fork: vi.fn(),
}));

vi.mock('../../electron/error-categorize', () => ({
  categorizeError: vi.fn().mockReturnValue({ category: 'unknown', suggestion: '' }),
}));

// ---------------------------------------------------------------------------
// Import under test — must come AFTER vi.mock declarations
// ---------------------------------------------------------------------------

import { routeChildMessage, type ChildMessageHandlers } from '../../electron/pipeline-bridge';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHandlers(): ChildMessageHandlers & {
  onTwoFARequest: ReturnType<typeof vi.fn>;
  onTwoFAResult: ReturnType<typeof vi.fn>;
  onCategoryComplete: ReturnType<typeof vi.fn>;
  onProgress: ReturnType<typeof vi.fn>;
} {
  return {
    onTwoFARequest: vi.fn(),
    onTwoFAResult: vi.fn(),
    onCategoryComplete: vi.fn(),
    onProgress: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routeChildMessage', () => {
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    handlers = makeHandlers();
  });

  // ---------------------------------------------------------------------------
  // Non-message values — ignored
  // ---------------------------------------------------------------------------

  it('returns false for null', () => {
    expect(routeChildMessage(null, handlers)).toBe(false);
    expect(handlers.onTwoFARequest).not.toHaveBeenCalled();
  });

  it('returns false for a primitive string', () => {
    expect(routeChildMessage('hello', handlers)).toBe(false);
  });

  it('returns false for a number', () => {
    expect(routeChildMessage(42, handlers)).toBe(false);
  });

  it('returns false for an object without a "type" key', () => {
    expect(routeChildMessage({ foo: 'bar' }, handlers)).toBe(false);
    expect(handlers.onProgress).not.toHaveBeenCalled();
  });

  it('returns false for an unknown type value', () => {
    expect(routeChildMessage({ type: 'unknown-event' }, handlers)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 2fa:request
  // ---------------------------------------------------------------------------

  it('calls onTwoFARequest and returns true for 2fa:request messages', () => {
    const msg = { type: '2fa:request', deliveryHint: 'SMS to ***-1234' };
    const result = routeChildMessage(msg, handlers);
    expect(result).toBe(true);
    expect(handlers.onTwoFARequest).toHaveBeenCalledOnce();
    expect(handlers.onTwoFARequest).toHaveBeenCalledWith(msg);
    expect(handlers.onTwoFAResult).not.toHaveBeenCalled();
    expect(handlers.onProgress).not.toHaveBeenCalled();
  });

  it('forwards optional error field on 2fa:request', () => {
    const msg = { type: '2fa:request', deliveryHint: 'Email', error: 'Wrong code, try again' };
    routeChildMessage(msg, handlers);
    expect(handlers.onTwoFARequest).toHaveBeenCalledWith(expect.objectContaining({ error: 'Wrong code, try again' }));
  });

  // ---------------------------------------------------------------------------
  // 2fa:result
  // ---------------------------------------------------------------------------

  it('calls onTwoFAResult and returns true for 2fa:result messages', () => {
    const msg = { type: '2fa:result', success: true };
    const result = routeChildMessage(msg, handlers);
    expect(result).toBe(true);
    expect(handlers.onTwoFAResult).toHaveBeenCalledOnce();
    expect(handlers.onTwoFAResult).toHaveBeenCalledWith(msg);
    expect(handlers.onTwoFARequest).not.toHaveBeenCalled();
  });

  it('forwards failure 2fa:result', () => {
    const msg = { type: '2fa:result', success: false, error: 'Code expired' };
    routeChildMessage(msg, handlers);
    expect(handlers.onTwoFAResult).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Code expired' }));
  });

  // ---------------------------------------------------------------------------
  // category-complete
  // ---------------------------------------------------------------------------

  it('calls onCategoryComplete and onProgress for category-complete messages', () => {
    const msg = { type: 'category-complete', phase: 'extract', category: 'labs', count: 12, status: 'complete' };
    const result = routeChildMessage(msg, handlers);
    expect(result).toBe(true);
    expect(handlers.onCategoryComplete).toHaveBeenCalledOnce();
    expect(handlers.onCategoryComplete).toHaveBeenCalledWith('labs', 12);
    // Also forwarded as a progress event
    expect(handlers.onProgress).toHaveBeenCalledOnce();
    expect(handlers.onProgress).toHaveBeenCalledWith(msg);
  });

  it('passes correct category and count for visits', () => {
    const msg = { type: 'category-complete', phase: 'extract', category: 'visits', count: 5, status: 'complete' };
    routeChildMessage(msg, handlers);
    expect(handlers.onCategoryComplete).toHaveBeenCalledWith('visits', 5);
  });

  // ---------------------------------------------------------------------------
  // Structured progress events
  // ---------------------------------------------------------------------------

  it('calls onProgress for phase-change events', () => {
    const msg = { type: 'phase-change', phase: 'login', status: 'running' };
    const result = routeChildMessage(msg, handlers);
    expect(result).toBe(true);
    expect(handlers.onProgress).toHaveBeenCalledWith(msg);
    expect(handlers.onCategoryComplete).not.toHaveBeenCalled();
  });

  it('calls onProgress for item-progress events', () => {
    const msg = { type: 'item-progress', phase: 'extract', category: 'labs', current: 3, total: 10 };
    const result = routeChildMessage(msg, handlers);
    expect(result).toBe(true);
    expect(handlers.onProgress).toHaveBeenCalledWith(msg);
  });

  it('calls onProgress for status-message events', () => {
    const msg = { type: 'status-message', phase: 'navigate', message: 'Finding lab results...' };
    const result = routeChildMessage(msg, handlers);
    expect(result).toBe(true);
    expect(handlers.onProgress).toHaveBeenCalledWith(msg);
  });

  // ---------------------------------------------------------------------------
  // Handler isolation — dispatches to exactly one handler per message type
  // ---------------------------------------------------------------------------

  it('does not call onTwoFARequest when handling a progress event', () => {
    routeChildMessage({ type: 'phase-change', phase: 'extract', status: 'running' }, handlers);
    expect(handlers.onTwoFARequest).not.toHaveBeenCalled();
    expect(handlers.onTwoFAResult).not.toHaveBeenCalled();
  });

  it('does not call onCategoryComplete for phase-change events', () => {
    routeChildMessage({ type: 'phase-change', phase: 'extract', status: 'complete' }, handlers);
    expect(handlers.onCategoryComplete).not.toHaveBeenCalled();
  });
});
