/**
 * IPC protocol types for communication between the Electron main process
 * (electron/pipeline-bridge.ts) and the subprocess (src/electron-runner.ts).
 *
 * This is the canonical source for these types. The ambient declarations in
 * src/shared-types.d.ts (included by electron/tsconfig.json) make them
 * available to electron/ without a cross-rootDir import.
 *
 * Protocol:
 *   Parent → Child: RunnerCommand (sent once, right after fork)
 *   Child → Parent: TwoFARequest | TwoFAResult | StructuredProgressEvent
 *   Parent → Child: TwoFAResponse
 */

// ---------------------------------------------------------------------------
// twoFactor enum values — single definition reused across all consumers
// ---------------------------------------------------------------------------

export const TWO_FACTOR_VALUES = ['none', 'email', 'manual', 'ui'] as const;
export type TwoFactorValue = (typeof TWO_FACTOR_VALUES)[number];

// ---------------------------------------------------------------------------
// loginForm enum values
// ---------------------------------------------------------------------------

export const LOGIN_FORM_VALUES = ['two-step', 'single-page', 'auto'] as const;
export type LoginFormValue = (typeof LOGIN_FORM_VALUES)[number];

// ---------------------------------------------------------------------------
// Runner command (Parent → Child)
// ---------------------------------------------------------------------------

export interface RunnerCommand {
  command: 'extract' | 'discover';
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

// ---------------------------------------------------------------------------
// 2FA messages (Child ↔ Parent)
// ---------------------------------------------------------------------------

export interface TwoFARequest {
  type: '2fa:request';
  message: string;
  deliveryHint?: string;
  error?: string;
}

export interface TwoFAResponse {
  type: '2fa:response';
  code: string | null;
}

export interface TwoFAResult {
  type: '2fa:result';
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// TwoFactorError — typed error class for 2FA failures
// ---------------------------------------------------------------------------

/**
 * Thrown (or matched against) when a pipeline operation fails due to a
 * 2FA-related issue (wrong code, timeout, cancellation, etc.).
 *
 * Replaces ad-hoc substring matching against error messages.
 */
export class TwoFactorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TwoFactorError';
  }

  /**
   * Returns true if the given error is a TwoFactorError or if the error
   * message matches known 2FA-related patterns.
   *
   * Used in the subprocess where errors may be thrown by third-party code
   * (Stagehand, auth strategies) that does not use TwoFactorError directly.
   */
  static is2FAError(err: unknown): boolean {
    if (err instanceof TwoFactorError) return true;
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();
    return (
      lower.includes('2fa') ||
      lower.includes('verification') ||
      lower.includes('otp') ||
      lower.includes('code not provided') ||
      lower.includes('cancelled')
    );
  }
}
