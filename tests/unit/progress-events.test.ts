import { describe, it, expect } from 'vitest';
import type {
  StructuredProgressEvent,
  PhaseChangeEvent,
  ItemProgressEvent,
  CategoryCompleteEvent,
} from '../../src/progress-events';

// ---------------------------------------------------------------------------
// Type guard helpers (mirrors what ProgressPanel does at runtime)
// ---------------------------------------------------------------------------

function isPhaseChange(e: StructuredProgressEvent): e is PhaseChangeEvent {
  return e.type === 'phase-change';
}

function isItemProgress(e: StructuredProgressEvent): e is ItemProgressEvent {
  return e.type === 'item-progress';
}

function isCategoryComplete(e: StructuredProgressEvent): e is CategoryCompleteEvent {
  return e.type === 'category-complete';
}

// ---------------------------------------------------------------------------
// Minimal reducer that mirrors what ProgressPanel does with structured events
// ---------------------------------------------------------------------------

type PhaseStatus = 'pending' | 'running' | 'complete' | 'error';

interface PhaseState {
  status: PhaseStatus;
  message?: string;
}

interface CategoryState {
  status: PhaseStatus;
  count?: number;
  message?: string;
}

interface StructuredState {
  phases: Record<string, PhaseState>;
  categories: Record<string, CategoryState>;
}

function applyEvent(state: StructuredState, event: StructuredProgressEvent): StructuredState {
  const next: StructuredState = {
    phases: { ...state.phases },
    categories: { ...state.categories },
  };

  if (isPhaseChange(event)) {
    next.phases[event.phase] = { status: event.status as PhaseStatus, message: event.message };
  } else if (isItemProgress(event)) {
    next.categories[event.category] = {
      status: 'running',
      count: event.current,
      message: event.message,
    };
  } else if (isCategoryComplete(event)) {
    next.categories[event.category] = {
      status: event.status as PhaseStatus,
      count: event.count,
    };
  }

  return next;
}

function makeInitialState(): StructuredState {
  return {
    phases: {
      login: { status: 'pending' },
      navigate: { status: 'pending' },
      extract: { status: 'pending' },
    },
    categories: {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StructuredProgressEvent types', () => {
  it('phase-change event has the correct shape', () => {
    const event: PhaseChangeEvent = {
      type: 'phase-change',
      phase: 'login',
      status: 'running',
      message: 'Logging in...',
    };
    expect(isPhaseChange(event)).toBe(true);
    expect(event.phase).toBe('login');
    expect(event.status).toBe('running');
    expect(event.message).toBe('Logging in...');
  });

  it('item-progress event has the correct shape', () => {
    const event: ItemProgressEvent = {
      type: 'item-progress',
      phase: 'extract',
      category: 'labs',
      current: 3,
      total: 10,
      message: 'Extracting labs...',
    };
    expect(isItemProgress(event)).toBe(true);
    expect(event.category).toBe('labs');
    expect(event.current).toBe(3);
    expect(event.total).toBe(10);
  });

  it('item-progress event works without optional total', () => {
    const event: ItemProgressEvent = {
      type: 'item-progress',
      phase: 'extract',
      category: 'visits',
      current: 0,
    };
    expect(isItemProgress(event)).toBe(true);
    expect(event.total).toBeUndefined();
  });

  it('category-complete event has the correct shape', () => {
    const event: CategoryCompleteEvent = {
      type: 'category-complete',
      phase: 'extract',
      category: 'medications',
      count: 5,
      status: 'complete',
    };
    expect(isCategoryComplete(event)).toBe(true);
    expect(event.count).toBe(5);
    expect(event.status).toBe('complete');
  });
});

describe('progress event state reducer', () => {
  it('updates phase status on phase-change event', () => {
    const state = makeInitialState();
    const event: PhaseChangeEvent = {
      type: 'phase-change',
      phase: 'login',
      status: 'running',
      message: 'Logging in...',
    };
    const next = applyEvent(state, event);
    expect(next.phases.login.status).toBe('running');
    expect(next.phases.login.message).toBe('Logging in...');
    // Other phases unchanged
    expect(next.phases.navigate.status).toBe('pending');
    expect(next.phases.extract.status).toBe('pending');
  });

  it('marks phase complete on phase-change complete event', () => {
    let state = makeInitialState();
    state = applyEvent(state, { type: 'phase-change', phase: 'login', status: 'running' });
    state = applyEvent(state, { type: 'phase-change', phase: 'login', status: 'complete', message: 'Logged in' });
    expect(state.phases.login.status).toBe('complete');
    expect(state.phases.login.message).toBe('Logged in');
  });

  it('sets category to running on item-progress event', () => {
    const state = makeInitialState();
    const event: ItemProgressEvent = {
      type: 'item-progress',
      phase: 'extract',
      category: 'labs',
      current: 0,
      message: 'Extracting labs...',
    };
    const next = applyEvent(state, event);
    expect(next.categories['labs']).toEqual({ status: 'running', count: 0, message: 'Extracting labs...' });
    // Other categories untouched
    expect(next.categories['visits']).toBeUndefined();
  });

  it('sets category to complete on category-complete event', () => {
    let state = makeInitialState();
    state = applyEvent(state, { type: 'item-progress', phase: 'extract', category: 'labs', current: 0 });
    state = applyEvent(state, { type: 'category-complete', phase: 'extract', category: 'labs', count: 12, status: 'complete' });
    expect(state.categories['labs']).toEqual({ status: 'complete', count: 12 });
  });

  it('does not mutate previous state object', () => {
    const state = makeInitialState();
    const next = applyEvent(state, { type: 'phase-change', phase: 'login', status: 'running' });
    expect(state.phases.login.status).toBe('pending');
    expect(next.phases.login.status).toBe('running');
  });

  it('processes a full extraction sequence', () => {
    let state = makeInitialState();

    // Login phase
    state = applyEvent(state, { type: 'phase-change', phase: 'login', status: 'running' });
    state = applyEvent(state, { type: 'phase-change', phase: 'login', status: 'complete' });

    // Navigate phase
    state = applyEvent(state, { type: 'phase-change', phase: 'navigate', status: 'running' });
    state = applyEvent(state, { type: 'phase-change', phase: 'navigate', status: 'complete' });

    // Extract phase — labs
    state = applyEvent(state, { type: 'phase-change', phase: 'extract', status: 'running' });
    state = applyEvent(state, { type: 'item-progress', phase: 'extract', category: 'labs', current: 0 });
    state = applyEvent(state, { type: 'category-complete', phase: 'extract', category: 'labs', count: 8, status: 'complete' });

    // Extract phase — visits
    state = applyEvent(state, { type: 'item-progress', phase: 'extract', category: 'visits', current: 0 });
    state = applyEvent(state, { type: 'category-complete', phase: 'extract', category: 'visits', count: 3, status: 'complete' });

    // Extract phase — medications
    state = applyEvent(state, { type: 'item-progress', phase: 'extract', category: 'medications', current: 0 });
    state = applyEvent(state, { type: 'category-complete', phase: 'extract', category: 'medications', count: 15, status: 'complete' });

    // Extract phase — messages
    state = applyEvent(state, { type: 'item-progress', phase: 'extract', category: 'messages', current: 0 });
    state = applyEvent(state, { type: 'category-complete', phase: 'extract', category: 'messages', count: 22, status: 'complete' });

    state = applyEvent(state, { type: 'phase-change', phase: 'extract', status: 'complete' });

    expect(state.phases.login.status).toBe('complete');
    expect(state.phases.navigate.status).toBe('complete');
    expect(state.phases.extract.status).toBe('complete');
    expect(state.categories['labs']).toEqual({ status: 'complete', count: 8 });
    expect(state.categories['visits']).toEqual({ status: 'complete', count: 3 });
    expect(state.categories['medications']).toEqual({ status: 'complete', count: 15 });
    expect(state.categories['messages']).toEqual({ status: 'complete', count: 22 });
  });

  it('processes a full discovery sequence', () => {
    let state = makeInitialState();

    state = applyEvent(state, { type: 'phase-change', phase: 'login', status: 'running', message: 'Logging in...' });
    state = applyEvent(state, { type: 'phase-change', phase: 'login', status: 'complete', message: 'Logged in' });
    state = applyEvent(state, { type: 'phase-change', phase: 'navigate', status: 'running', message: 'Discovering portal...' });
    state = applyEvent(state, { type: 'phase-change', phase: 'navigate', status: 'complete', message: 'Discovered 4/4 sections' });

    expect(state.phases.login.status).toBe('complete');
    expect(state.phases.navigate.status).toBe('complete');
    expect(state.phases.extract.status).toBe('pending'); // never touched in discovery
    expect(Object.keys(state.categories)).toHaveLength(0);
  });
});

describe('sendProgressEvent behavior', () => {
  it('sends via process.send when available', async () => {
    // We can test the sendProgressEvent function from electron-runner
    // by checking that it calls process.send when defined.
    const sent: unknown[] = [];
    const originalSend = process.send;

    // Temporarily mock process.send
    process.send = (msg: unknown) => {
      sent.push(msg);
      return true;
    };

    try {
      const { sendProgressEvent } = await import('../../src/electron-runner.js');
      sendProgressEvent({ type: 'phase-change', phase: 'login', status: 'running' });
      expect(sent).toHaveLength(1);
      expect((sent[0] as PhaseChangeEvent).type).toBe('phase-change');
    } finally {
      process.send = originalSend;
    }
  });

  it('does not throw when process.send is undefined', async () => {
    const originalSend = process.send;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process as any).send = undefined;

    try {
      const { sendProgressEvent } = await import('../../src/electron-runner.js');
      // Should not throw
      expect(() => {
        sendProgressEvent({ type: 'phase-change', phase: 'login', status: 'running' });
      }).not.toThrow();
    } finally {
      process.send = originalSend;
    }
  });
});
