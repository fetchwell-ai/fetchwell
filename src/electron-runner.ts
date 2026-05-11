/**
 * Electron Runner — Subprocess Entry Point
 *
 * This script is spawned by electron/pipeline-bridge.ts as a child process.
 * It receives a command via Node IPC, sets up the OTP callback for the "ui"
 * 2FA strategy, then runs the extraction or discovery pipeline.
 *
 * Communication protocol (Node IPC):
 *   Parent → Child: RunnerCommand (sent as the first IPC message)
 *   Child → Parent: { type: '2fa:request', message: string }
 *   Parent → Child: { type: '2fa:response', code: string | null }
 *
 * stdout lines are captured by the parent and forwarded as progress events.
 */

import dotenv from 'dotenv';
dotenv.config({ override: true });

import { setOtpCallback } from './auth/strategies/two-factor.js';
import { type ProviderConfig } from './config.js';
import { type StructuredProgressEvent } from './progress-events.js';

// ---------------------------------------------------------------------------
// IPC message types
// ---------------------------------------------------------------------------

interface RunnerCommand {
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
    loginForm: 'two-step' | 'single-page' | 'auto';
    twoFactor: 'none' | 'email' | 'manual' | 'ui';
  };
}

interface TwoFARequest {
  type: '2fa:request';
  message: string;
  deliveryHint?: string;
  error?: string;
}

interface TwoFAResponse {
  type: '2fa:response';
  code: string | null;
}

interface TwoFAResult {
  type: '2fa:result';
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Structured progress event emitter
// ---------------------------------------------------------------------------

/**
 * Send a structured progress event to the parent Electron process via IPC.
 * Only sends when process.send is available (subprocess mode).
 * CLI mode is unaffected — existing console.log calls handle that.
 */
export function sendProgressEvent(event: StructuredProgressEvent): void {
  if (process.send) {
    process.send(event);
  }
}

// ---------------------------------------------------------------------------
// OTP callback setup
// ---------------------------------------------------------------------------

/**
 * Send a 2fa:result IPC event to the parent indicating whether the code was accepted.
 */
function sendTwoFAResult(success: boolean, error?: string): void {
  if (process.send) {
    const result: TwoFAResult = { type: '2fa:result', success, error };
    process.send(result);
  }
}

/**
 * Request a 2FA code from the renderer via IPC.
 * Sends a 2fa:request and waits for a 2fa:response.
 * @param error - Optional error message to show in the modal (for retries).
 */
function requestOtpFromRenderer(opts?: { deliveryHint?: string; error?: string }): Promise<string | null> {
  return new Promise((resolve) => {
    const request: TwoFARequest = {
      type: '2fa:request',
      message: 'Enter your two-factor authentication code',
      ...(opts?.deliveryHint !== undefined ? { deliveryHint: opts.deliveryHint } : {}),
      ...(opts?.error !== undefined ? { error: opts.error } : {}),
    };

    if (!process.send) {
      console.error('[electron-runner] No IPC channel — cannot request 2FA code');
      resolve(null);
      return;
    }

    process.send(request);

    const handler = (msg: unknown) => {
      const response = msg as TwoFAResponse;
      if (response && response.type === '2fa:response') {
        process.off('message', handler);
        resolve(response.code);
      }
    };

    process.on('message', handler);
  });
}

/**
 * Whether a 2FA code was requested during this run.
 * Used to send 2fa:result { success: true } when the pipeline completes.
 */
let twoFAWasRequested = false;

/**
 * Install the OTP callback that sends a 2fa:request IPC message to the parent
 * and resolves when the parent responds with a 2fa:response.
 */
function installOtpCallback(): void {
  setOtpCallback(async (deliveryHint?: string): Promise<string | null> => {
    twoFAWasRequested = true;
    return requestOtpFromRenderer({ deliveryHint });
  });
}

// ---------------------------------------------------------------------------
// Build ProviderConfig from command payload
// ---------------------------------------------------------------------------

function buildProviderConfig(cmd: RunnerCommand): ProviderConfig {
  return {
    id: cmd.providerConfig.id,
    name: cmd.providerConfig.name,
    type: 'mychart',
    url: cmd.providerConfig.url,
    username: cmd.providerConfig.username,
    password: cmd.providerConfig.password,
    auth: {
      loginForm: cmd.providerConfig.loginForm,
      twoFactor: cmd.providerConfig.twoFactor,
    },
    authenticatedSelectors: [],
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Install OTP callback before anything else
  installOtpCallback();

  // Wait for the command from the parent process
  const cmd = await new Promise<RunnerCommand>((resolve, reject) => {
    if (!process.send) {
      // Not running with IPC — fallback for direct invocation during dev
      reject(new Error('[electron-runner] Must be spawned with IPC (fork)'));
      return;
    }

    // The parent sends the command immediately after fork
    const handler = (msg: unknown) => {
      const command = msg as RunnerCommand;
      if (command && (command.command === 'extract' || command.command === 'discover')) {
        process.off('message', handler);
        resolve(command);
      }
    };

    process.on('message', handler);

    // Timeout if no command received within 10 seconds
    setTimeout(() => reject(new Error('[electron-runner] Timed out waiting for command')), 10_000);
  });

  const provider = buildProviderConfig(cmd);

  if (cmd.command === 'extract') {
    // Dynamically import to avoid top-level side effects (dotenv, arg parsing, run())
    const { extractProvider } = await import('./extract/runner.js');
    await runWithTwoFARetry(() =>
      extractProvider(provider, cmd.incremental, cmd.downloadFolder, sendProgressEvent),
    );
  } else if (cmd.command === 'discover') {
    const { discoverProviderById } = await import('./discover/runner.js');
    await runWithTwoFARetry(() =>
      discoverProviderById(provider, cmd.downloadFolder, sendProgressEvent),
    );
  }
}

/**
 * Run a pipeline operation with automatic 2FA retry.
 *
 * If the operation fails with a 2FA-related error, we notify the renderer
 * (so it can re-show the modal with an error message) and re-run the operation
 * up to MAX_2FA_RETRIES times. On each retry the OTP callback will be invoked
 * again, giving the user a fresh chance to enter the correct code.
 */
const MAX_2FA_RETRIES = 2;

async function runWithTwoFARetry(operation: () => Promise<void>): Promise<void> {
  let attempt = 0;

  while (true) {
    try {
      await operation();
      // Notify the renderer that the 2FA code was accepted (so the modal can dismiss)
      if (twoFAWasRequested) {
        sendTwoFAResult(true);
      }
      return;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const is2FAError =
        message.toLowerCase().includes('2fa') ||
        message.toLowerCase().includes('verification') ||
        message.toLowerCase().includes('otp') ||
        message.toLowerCase().includes('code not provided') ||
        message.toLowerCase().includes('cancelled');

      if (is2FAError && attempt < MAX_2FA_RETRIES) {
        attempt++;
        twoFAWasRequested = false; // Reset so the next attempt can track a fresh request
        // Notify renderer: code failed, re-prompt
        sendTwoFAResult(false, 'Code not accepted — try again');
        // Update the OTP callback to send an error field on the next request
        setOtpCallback(async (deliveryHint?: string): Promise<string | null> => {
          twoFAWasRequested = true;
          return requestOtpFromRenderer({ deliveryHint, error: 'Code not accepted — try again' });
        });
        continue;
      }

      // Not a 2FA error or max retries reached — propagate
      throw err;
    }
  }
}

main().catch((err: unknown) => {
  console.error('[electron-runner] Fatal error:', err);
  process.exit(1);
});
