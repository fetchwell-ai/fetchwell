/**
 * Shared ambient type declarations for types used across tsconfig boundaries.
 *
 * These ambient declarations make the types available as globals in both:
 *   - tsconfig.json (src/, ESM)
 *   - electron/tsconfig.json (electron/, CJS)
 *
 * The canonical runtime implementations are exported from:
 *   - src/progress-events.ts — StructuredProgressEvent and friends
 *   - src/ipc-types.ts       — IPC protocol types (RunnerCommand, TwoFA*, TwoFactorError)
 *
 * The ambient declarations here allow electron/ code to reference these types
 * without a cross-tsconfig import (which is blocked by rootDir constraints).
 */

// ---------------------------------------------------------------------------
// twoFactor / loginForm type aliases
// (runtime values live in src/ipc-types.ts)
// ---------------------------------------------------------------------------

declare type TwoFactorValue = 'none' | 'email' | 'manual' | 'ui';
declare type LoginFormValue = 'two-step' | 'single-page' | 'auto';

// ---------------------------------------------------------------------------
// IPC protocol types
// (runtime definitions live in src/ipc-types.ts)
// ---------------------------------------------------------------------------

declare interface RunnerCommand {
  command: 'extract';
  portalId: string;
  incremental: boolean;
  downloadFolder?: string;
  providerConfig: {
    id: string;
    name: string;
    url: string;
    username: string;
    password: string;
    loginForm: LoginFormValue;
    twoFactor: TwoFactorValue;
  };
}

declare interface TwoFARequest {
  type: '2fa:request';
  message: string;
  deliveryHint?: string;
  error?: string;
}

declare interface TwoFAResponse {
  type: '2fa:response';
  code: string | null;
}

declare interface TwoFAResult {
  type: '2fa:result';
  success: boolean;
  error?: string;
}

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
