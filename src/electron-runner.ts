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

// ---------------------------------------------------------------------------
// IPC message types
// ---------------------------------------------------------------------------

interface RunnerCommand {
  command: 'extract' | 'discover';
  portalId: string;
  incremental: boolean;
  providerConfig: {
    id: string;
    name: string;
    url: string;
    username: string;
    password: string;
    loginForm: 'two-step' | 'single-page';
    twoFactor: 'none' | 'email' | 'manual' | 'ui';
  };
}

interface TwoFARequest {
  type: '2fa:request';
  message: string;
}

interface TwoFAResponse {
  type: '2fa:response';
  code: string | null;
}

// ---------------------------------------------------------------------------
// OTP callback setup
// ---------------------------------------------------------------------------

/**
 * Install the OTP callback that sends a 2fa:request IPC message to the parent
 * and resolves when the parent responds with a 2fa:response.
 */
function installOtpCallback(): void {
  setOtpCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      const request: TwoFARequest = {
        type: '2fa:request',
        message: 'Enter your two-factor authentication code',
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
    await extractProvider(provider, cmd.incremental);
  } else if (cmd.command === 'discover') {
    const { discoverProviderById } = await import('./discover/runner.js');
    await discoverProviderById(provider);
  }
}

main().catch((err: unknown) => {
  console.error('[electron-runner] Fatal error:', err);
  process.exit(1);
});
