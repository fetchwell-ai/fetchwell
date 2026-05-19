/**
 * Shared ambient type declarations for types used across tsconfig boundaries.
 *
 * These ambient declarations make the types available as globals in both:
 *   - tsconfig.json (src/, ESM)
 *   - electron/tsconfig.json (electron/, CJS)
 *
 * The canonical runtime implementations are exported from src/progress-events.ts
 * (for use within the src/ module graph via import). The ambient declarations here
 * allow electron/ code to reference these types without a cross-tsconfig import.
 */

// ---------------------------------------------------------------------------
// Structured progress event types
// (runtime exports live in src/progress-events.ts)
// ---------------------------------------------------------------------------

declare type ProgressPhase = 'login' | 'navigate' | 'extract';
declare type ProgressCategory = 'labs' | 'visits' | 'medications' | 'messages';
declare type ProgressStatus = 'pending' | 'running' | 'complete' | 'error';

declare interface PhaseChangeEvent {
  type: 'phase-change';
  phase: ProgressPhase;
  status: ProgressStatus;
  message?: string;
}

declare interface ItemProgressEvent {
  type: 'item-progress';
  phase: ProgressPhase;
  category: ProgressCategory;
  current: number;
  total?: number;
  message?: string;
}

declare interface CategoryCompleteEvent {
  type: 'category-complete';
  phase: ProgressPhase;
  category: ProgressCategory;
  count: number;
  status: ProgressStatus;
}

declare interface StatusMessageEvent {
  type: 'status-message';
  phase: string;
  message: string;
}

declare type StructuredProgressEvent =
  | PhaseChangeEvent
  | ItemProgressEvent
  | CategoryCompleteEvent
  | StatusMessageEvent;
