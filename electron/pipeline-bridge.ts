/**
 * Pipeline Bridge — Electron ↔ Pipeline Subprocess Communication
 *
 * Wraps the extraction and discovery pipelines for use from the Electron main
 * process. Each run is launched as a child process (via fork) that executes
 * src/electron-runner.ts under tsx.
 *
 * IPC protocol with the child:
 *   Parent → Child: RunnerCommand (sent once, right after fork)
 *   Child → Parent: { type: '2fa:request', message: string }
 *   Parent → Child: { type: '2fa:response', code: string | null }
 *
 * IPC events emitted to the BrowserWindow renderer:
 *   extraction:log / discovery:log     — progress message string
 *   extraction:complete / discovery:complete — success (no payload)
 *   extraction:error / discovery:error — ErrorEvent payload
 *   2fa:request                         — triggers the OTP modal
 */

import { fork } from 'child_process';
import * as path from 'path';
import { BrowserWindow, ipcMain } from 'electron';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RunConfig {
  apiKey: string;
  credentials: { username: string; password: string };
  portalUrl: string;
  portalId: string;
  portalName: string;
  downloadFolder: string;
  showBrowser: boolean;
  incremental: boolean;
  loginForm: 'two-step' | 'single-page';
  twoFactor: 'none' | 'email' | 'manual' | 'ui';
}

// ---------------------------------------------------------------------------
// Internal types (IPC messages)
// ---------------------------------------------------------------------------

interface ProgressEvent {
  type: 'log';
  message: string;
}

interface ErrorEvent {
  type: 'error';
  category: string;
  message: string;
  suggestion: string;
}

interface TwoFARequest {
  type: '2fa:request';
  message: string;
}

interface TwoFAResponse {
  type: '2fa:response';
  code: string | null;
}

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

// ---------------------------------------------------------------------------
// 2FA IPC relay
// ---------------------------------------------------------------------------

/**
 * Map from portalId → resolve function for pending 2FA requests.
 * Only one outstanding 2FA request per portal is supported at a time.
 */
const pendingOtpResolvers = new Map<string, (code: string | null) => void>();

/** Track active pipeline runs to prevent concurrent runs for the same portal. */
const activeRuns = new Set<string>();

/**
 * Register the ipcMain handler for '2fa:submit' once.
 * The renderer sends: { portalId, code }
 */
let twoFaHandlerRegistered = false;
function ensureTwoFaHandler(): void {
  if (twoFaHandlerRegistered) return;
  twoFaHandlerRegistered = true;

  ipcMain.on('2fa:submit', (_event, payload: { portalId: string; code: string | null }) => {
    const resolve = pendingOtpResolvers.get(payload.portalId);
    if (resolve) {
      pendingOtpResolvers.delete(payload.portalId);
      resolve(payload.code);
    }
  });
}

// ---------------------------------------------------------------------------
// Error categorization
// ---------------------------------------------------------------------------

function categorizeError(message: string): { category: string; suggestion: string } {
  const lower = message.toLowerCase();

  if (lower.includes('credentials') || lower.includes('login failed')) {
    return {
      category: 'credentials',
      suggestion: 'Check your username and password in portal settings',
    };
  }

  if (lower.includes('2fa') || lower.includes('timed out')) {
    return {
      category: '2fa_timeout',
      suggestion: 'Try again — enter the code within 5 minutes',
    };
  }

  if (lower.includes('enotfound') || lower.includes('econnrefused')) {
    return {
      category: 'network',
      suggestion: 'Check your internet connection',
    };
  }

  if (lower.includes('nav-map') || lower.includes('not found')) {
    return {
      category: 'portal_structure',
      suggestion: "The portal may have changed — try re-running Map",
    };
  }

  return {
    category: 'unknown',
    suggestion: 'An unexpected error occurred. Copy the log for troubleshooting.',
  };
}

// ---------------------------------------------------------------------------
// Core subprocess runner
// ---------------------------------------------------------------------------

/**
 * Fork the electron-runner subprocess, wire up IPC, and return a Promise
 * that resolves on success or rejects with an Error on failure.
 *
 * @param command    - 'extract' or 'discover'
 * @param win        - The BrowserWindow to receive IPC events
 * @param config     - Run configuration
 * @param logChannel - IPC channel name for log events (e.g. 'extraction:log')
 */
function runSubprocess(
  command: 'extract' | 'discover',
  win: BrowserWindow,
  config: RunConfig,
  logChannel: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (activeRuns.has(config.portalId)) {
      reject(new Error(`A pipeline operation is already running for portal: ${config.portalId}`));
      return;
    }
    activeRuns.add(config.portalId);
    ensureTwoFaHandler();

    // Path to the runner script, resolved relative to this file
    const runnerScript = path.join(__dirname, '..', 'src', 'electron-runner.ts');

    // Environment for the child process — the env-bridge
    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ANTHROPIC_API_KEY: config.apiKey,
      BROWSER_PROVIDER: 'stagehand-local',
      HEADLESS: config.showBrowser ? 'false' : 'true',
    };

    const child = fork(runnerScript, [], {
      execPath: process.execPath,
      execArgv: ['--import', 'tsx/esm'],
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    // Capture stdout lines → forward as progress events
    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      let buffer = '';
      child.stdout.on('data', (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) {
            const event: ProgressEvent = { type: 'log', message: line };
            if (!win.isDestroyed()) {
              win.webContents.send(logChannel, event.message);
            }
          }
        }
      });
    }

    // Forward stderr to main process stderr (for debugging)
    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        process.stderr.write(chunk);
      });
    }

    // Handle IPC messages from child (2FA requests)
    child.on('message', (msg: unknown) => {
      const message = msg as TwoFARequest;
      if (message && message.type === '2fa:request') {
        // Forward 2FA request to renderer
        if (!win.isDestroyed()) {
          win.webContents.send('2fa:request', { portalId: config.portalId });
        }

        // Wait for renderer to call 2fa:submit
        pendingOtpResolvers.set(config.portalId, (code: string | null) => {
          const response: TwoFAResponse = { type: '2fa:response', code };
          child.send(response);
        });
      }
    });

    // Build the command payload
    const runnerCommand: RunnerCommand = {
      command,
      portalId: config.portalId,
      incremental: config.incremental,
      providerConfig: {
        id: config.portalId,
        name: config.portalName,
        url: config.portalUrl,
        username: config.credentials.username,
        password: config.credentials.password,
        loginForm: config.loginForm,
        twoFactor: config.twoFactor,
      },
    };

    // Attach all event listeners before sending the command to avoid
    // missing events if the child process exits synchronously.
    child.on('close', (code: number | null) => {
      activeRuns.delete(config.portalId);
      pendingOtpResolvers.delete(config.portalId);

      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Pipeline process exited with code ${code}`));
      }
    });

    child.on('error', (err: Error) => {
      activeRuns.delete(config.portalId);
      pendingOtpResolvers.delete(config.portalId);
      reject(err);
    });

    // Send the command after all listeners are registered
    child.send(runnerCommand);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the extraction pipeline for a portal.
 * Emits extraction:log, extraction:complete, or extraction:error to the window.
 */
export async function runExtraction(portalId: string, win: BrowserWindow, config: RunConfig): Promise<void> {
  try {
    await runSubprocess('extract', win, { ...config, portalId }, 'extraction:log');
    if (!win.isDestroyed()) {
      win.webContents.send('extraction:complete', { portalId });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const { category, suggestion } = categorizeError(message);
    const errorEvent: ErrorEvent = { type: 'error', category, message, suggestion };
    if (!win.isDestroyed()) {
      win.webContents.send('extraction:error', errorEvent);
    }
  }
}

/**
 * Run the discovery pipeline for a portal.
 * Emits discovery:log, discovery:complete, or discovery:error to the window.
 */
export async function runDiscovery(portalId: string, win: BrowserWindow, config: RunConfig): Promise<void> {
  try {
    await runSubprocess('discover', win, { ...config, portalId }, 'discovery:log');
    if (!win.isDestroyed()) {
      win.webContents.send('discovery:complete', { portalId });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const { category, suggestion } = categorizeError(message);
    const errorEvent: ErrorEvent = { type: 'error', category, message, suggestion };
    if (!win.isDestroyed()) {
      win.webContents.send('discovery:error', errorEvent);
    }
  }
}
