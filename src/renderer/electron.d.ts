/**
 * Ambient type declarations for the renderer process (browser context).
 *
 * Progress event types are sourced from src/progress-events.ts to avoid
 * maintaining a third copy. PortalEntry/Settings remain here as ambient
 * declarations since the renderer cannot import from electron/ (main process).
 */

// This import makes the file a TypeScript module, which is required for
// 'declare global {}' augmentations. The import itself is empty (no named
// imports) so ESLint cannot flag any individual name as unused.
// The inline import(...) expressions inside declare global {} pull types
// directly from the canonical source (src/progress-events.ts).
import type {} from '../progress-events';

declare global {
  // Re-export progress event types as global type aliases for the renderer.
  // Using 'type' (not 'interface extends import(...)') because ESLint's
  // TypeScript parser does not support the 'extends import(...)' form.
  type ProgressPhase = import('../progress-events').ProgressPhase;
  type ProgressCategory = import('../progress-events').ProgressCategory;
  type ProgressStatus = import('../progress-events').ProgressStatus;
  type PhaseChangeEvent = import('../progress-events').PhaseChangeEvent;
  type ItemProgressEvent = import('../progress-events').ItemProgressEvent;
  type CategoryCompleteEvent = import('../progress-events').CategoryCompleteEvent;
  type StatusMessageEvent = import('../progress-events').StatusMessageEvent;
  type StructuredProgressEvent = import('../progress-events').StructuredProgressEvent;

  interface PortalEntry {
    id: string;
    name: string;
    url: string;
    loginForm: 'two-step' | 'single-page' | 'auto';
    twoFactor: 'none' | 'email' | 'manual' | 'ui';
    hasCredentials: boolean;
    discoveredAt: string | null;
    lastExtractedAt: string | null;
    labCount?: number;
    visitCount?: number;
    medicationCount?: number;
    messageCount?: number;
  }

  interface PortalInput {
    name: string;
    url: string;
    loginForm?: 'two-step' | 'single-page' | 'auto';
    twoFactor: 'none' | 'email' | 'manual' | 'ui';
    username?: string;
    password?: string;
  }

  type ThemePreference = 'system' | 'light' | 'dark';

  type ApiKeySource = 'bundled' | 'custom';

  interface Settings {
    downloadFolder: string;
    showBrowser: boolean;
    incrementalExtraction: boolean;
    apiKeyConfigured: boolean;
    apiKeySource: ApiKeySource;
    theme: ThemePreference;
  }

  interface ElectronAPI {
    getPortals(): Promise<PortalEntry[]>;
    addPortal(input: PortalInput): Promise<PortalEntry>;
    updatePortal(id: string, updates: Partial<PortalInput>): Promise<PortalEntry>;
    removePortal(id: string): Promise<void>;
    getSettings(): Promise<Settings>;
    updateSettings(updates: Partial<Settings & { apiKey?: string; theme?: ThemePreference }>): Promise<void>;
    validateApiKey(key: string): Promise<boolean>;
    runExtraction(portalId: string): Promise<void>;
    cancelOperation(portalId: string): Promise<boolean>;
    chooseFolder(): Promise<string | null>;
    openInFinder(folderPath: string): Promise<void>;
    revealInFinder(folderPath: string): Promise<void>;
    getPortalCredentials(portalId: string): Promise<{ username: string; hasPassword: boolean } | null>;
    onProgress(callback: (message: string) => void): () => void;
    onComplete(callback: (operation: string, data: { portalId: string }) => void): () => void;
    onError(callback: (operation: string, data: { type: string; category: string; message: string; suggestion: string }) => void): () => void;
    onStructuredProgress(callback: (operation: string, event: StructuredProgressEvent) => void): () => void;
    on2FARequest(callback: (payload: { portalId: string; twoFactorType: 'none' | 'email' | 'manual' | 'ui'; deliveryHint?: string; error?: string }) => void): () => void;
    on2FAResult(callback: (payload: { portalId: string; success: boolean; error?: string }) => void): () => void;
    submit2FACode(payload: { portalId: string; code: string | null }): void;

    // --- Dark mode ---
    darkModeShouldUseDark(): Promise<boolean>;
    darkModeSetTheme(theme: ThemePreference): Promise<boolean>;
    onDarkModeUpdated(callback: (isDark: boolean) => void): () => void;
  }

  interface Window {
    electronAPI: ElectronAPI;
  }
}
