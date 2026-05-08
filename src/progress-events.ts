/**
 * Structured progress event types shared between the subprocess
 * (src/electron-runner.ts) and the pipeline bridge (electron/pipeline-bridge.ts).
 *
 * Events are sent via process.send() (Node IPC) from the subprocess to the
 * parent Electron process, which forwards them to the renderer.
 *
 * These events coexist with the existing stdout logging (used by CLI mode).
 */

export type ProgressPhase = 'login' | 'navigate' | 'extract';
export type ProgressCategory = 'labs' | 'visits' | 'medications' | 'messages';
export type ProgressStatus = 'pending' | 'running' | 'complete' | 'error';

/**
 * Signals that the pipeline has entered a new top-level phase.
 */
export interface PhaseChangeEvent {
  type: 'phase-change';
  phase: ProgressPhase;
  status: ProgressStatus;
  message?: string;
}

/**
 * Reports current item count progress within a category.
 */
export interface ItemProgressEvent {
  type: 'item-progress';
  phase: ProgressPhase;
  category: ProgressCategory;
  current: number;
  total?: number;
  message?: string;
}

/**
 * Signals that a category has finished extracting.
 */
export interface CategoryCompleteEvent {
  type: 'category-complete';
  phase: ProgressPhase;
  category: ProgressCategory;
  count: number;
  status: ProgressStatus;
}

export type StructuredProgressEvent =
  | PhaseChangeEvent
  | ItemProgressEvent
  | CategoryCompleteEvent;
