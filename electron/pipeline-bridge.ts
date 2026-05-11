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
 *   extraction:log / discovery:log         — progress message string (stdout)
 *   extraction:progress / discovery:progress — StructuredProgressEvent (IPC)
 *   extraction:complete / discovery:complete — success (no payload)
 *   extraction:error / discovery:error     — ErrorEvent payload
 *   2fa:request                             — triggers the OTP modal
 */

import { fork } from 'child_process';
import * as path from 'path';
import { BrowserWindow, ipcMain } from 'electron';
import { categorizeError } from './error-categorize';

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
  loginForm: 'two-step' | 'single-page' | 'auto';
  twoFactor: 'none' | 'email' | 'manual' | 'ui';
}

export interface CategoryCounts {
  labCount: number;
  visitCount: number;
  medicationCount: number;
  messageCount: number;
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

/**
 * Structured progress event sent from the subprocess via process.send().
 * Mirrors the types in src/progress-events.ts (kept in sync manually to
 * avoid a cross-tsconfig import).
 */
type StructuredProgressEvent =
  | { type: 'phase-change'; phase: string; status: string; message?: string }
  | { type: 'item-progress'; phase: string; category: string; current: number; total?: number; message?: string }
  | { type: 'category-complete'; phase: string; category: string; count: number; status: string }
  | { type: 'status-message'; phase: string; message: string };

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

/** Map from portalId → active child process, so we can kill it on cancel. */
const activeChildren = new Map<string, ReturnType<typeof fork>>();

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
): Promise<CategoryCounts> {
  return new Promise((resolve, reject) => {
    if (activeRuns.has(config.portalId)) {
      reject(new Error(`A pipeline operation is already running for portal: ${config.portalId}`));
      return;
    }
    activeRuns.add(config.portalId);
    ensureTwoFaHandler();

    // Accumulate category-complete counts during extraction
    const counts: CategoryCounts = {
      labCount: 0,
      visitCount: 0,
      medicationCount: 0,
      messageCount: 0,
    };

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
    activeChildren.set(config.portalId, child);

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

    // Handle IPC messages from child (2FA requests, 2FA results, and structured progress events)
    child.on('message', (msg: unknown) => {
      const message = msg as TwoFARequest | TwoFAResult | StructuredProgressEvent;

      if (message && message.type === '2fa:request') {
        const twoFaMsg = message as TwoFARequest;
        // Forward 2FA request to renderer (include twoFactor type and optional error for retries)
        if (!win.isDestroyed()) {
          win.webContents.send('2fa:request', {
            portalId: config.portalId,
            twoFactorType: config.twoFactor,
            error: twoFaMsg.error,
          });
        }

        // Wait for renderer to call 2fa:submit
        pendingOtpResolvers.set(config.portalId, (code: string | null) => {
          const response: TwoFAResponse = { type: '2fa:response', code };
          child.send(response);
        });
        return;
      }

      if (message && message.type === '2fa:result') {
        const resultMsg = message as TwoFAResult;
        // Forward 2FA result to renderer so the modal can update its state
        if (!win.isDestroyed()) {
          win.webContents.send('2fa:result', {
            portalId: config.portalId,
            success: resultMsg.success,
            error: resultMsg.error,
          });
        }
        return;
      }

      // Accumulate category-complete counts
      if (message && message.type === 'category-complete') {
        const cat = (message as { type: 'category-complete'; category: string; count: number }).category;
        const count = (message as { type: 'category-complete'; category: string; count: number }).count;
        if (cat === 'labs') counts.labCount = count;
        else if (cat === 'visits') counts.visitCount = count;
        else if (cat === 'medications') counts.medicationCount = count;
        else if (cat === 'messages') counts.messageCount = count;
      }

      // Forward structured progress events to the renderer
      if (
        message &&
        (message.type === 'phase-change' ||
          message.type === 'item-progress' ||
          message.type === 'category-complete' ||
          message.type === 'status-message')
      ) {
        const progressChannel = command === 'extract' ? 'extraction:progress' : 'discovery:progress';
        if (!win.isDestroyed()) {
          win.webContents.send(progressChannel, message);
        }
      }
    });

    // Build the command payload
    const runnerCommand: RunnerCommand = {
      command,
      portalId: config.portalId,
      incremental: config.incremental,
      downloadFolder: config.downloadFolder || undefined,
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
      activeChildren.delete(config.portalId);
      pendingOtpResolvers.delete(config.portalId);

      if (code === 0) {
        resolve(counts);
      } else {
        reject(new Error(`Pipeline process exited with code ${code}`));
      }
    });

    child.on('error', (err: Error) => {
      activeRuns.delete(config.portalId);
      activeChildren.delete(config.portalId);
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
 * Resolves with accumulated CategoryCounts on success.
 * Rejects on error so callers can distinguish success from failure.
 */
export async function runExtraction(portalId: string, win: BrowserWindow, config: RunConfig): Promise<CategoryCounts> {
  try {
    const counts = await runSubprocess('extract', win, { ...config, portalId }, 'extraction:log');
    if (!win.isDestroyed()) {
      win.webContents.send('extraction:complete', { portalId });
    }
    return counts;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const { category, suggestion } = categorizeError(message);
    const errorEvent: ErrorEvent = { type: 'error', category, message, suggestion };
    if (!win.isDestroyed()) {
      win.webContents.send('extraction:error', errorEvent);
    }
    throw err;
  }
}

/**
 * Kill the active child process for a portal, if one is running.
 * Returns true if a process was found and killed, false otherwise.
 */
export function cancelOperation(portalId: string): boolean {
  const child = activeChildren.get(portalId);
  if (!child) return false;
  child.kill('SIGTERM');
  activeChildren.delete(portalId);
  activeRuns.delete(portalId);
  pendingOtpResolvers.delete(portalId);
  return true;
}

/**
 * Run the discovery pipeline for a portal.
 * Emits discovery:log, discovery:complete, or discovery:error to the window.
 * Rejects on error so callers can distinguish success from failure.
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
    throw err;
  }
}

