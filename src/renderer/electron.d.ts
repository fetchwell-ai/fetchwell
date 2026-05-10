interface PortalEntry {
  id: string;
  name: string;
  url: string;
  loginForm: 'two-step' | 'single-page';
  twoFactor: 'none' | 'email' | 'manual' | 'ui';
  hasCredentials: boolean;
  discoveredAt: string | null;
  lastExtractedAt: string | null;
}

interface PortalInput {
  name: string;
  url: string;
  loginForm: 'two-step' | 'single-page';
  twoFactor: 'none' | 'email' | 'manual' | 'ui';
  username?: string;
  password?: string;
}

type ThemePreference = 'system' | 'light' | 'dark';

interface Settings {
  downloadFolder: string;
  showBrowser: boolean;
  incrementalExtraction: boolean;
  apiKeyConfigured: boolean;
  theme: ThemePreference;
}

// ── Structured progress event types (mirrored from src/progress-events.ts) ─

type ProgressPhase = 'login' | 'navigate' | 'extract';
type ProgressCategory = 'labs' | 'visits' | 'medications' | 'messages';
type ProgressStatus = 'pending' | 'running' | 'complete' | 'error';

interface PhaseChangeEvent {
  type: 'phase-change';
  phase: ProgressPhase;
  status: ProgressStatus;
  message?: string;
}

interface ItemProgressEvent {
  type: 'item-progress';
  phase: ProgressPhase;
  category: ProgressCategory;
  current: number;
  total?: number;
  message?: string;
}

interface CategoryCompleteEvent {
  type: 'category-complete';
  phase: ProgressPhase;
  category: ProgressCategory;
  count: number;
  status: ProgressStatus;
}

interface StatusMessageEvent {
  type: 'status-message';
  phase: string;
  message: string;
}

type StructuredProgressEvent = PhaseChangeEvent | ItemProgressEvent | CategoryCompleteEvent | StatusMessageEvent;

// ────────────────────────────────────────────────────────────────────────────

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
  getPortalCredentials(portalId: string): Promise<{ username: string; password: string } | null>;
  onProgress(callback: (message: string) => void): void;
  onComplete(callback: (operation: string, data: { portalId: string }) => void): void;
  onError(callback: (operation: string, data: { type: string; category: string; message: string; suggestion: string }) => void): void;
  onStructuredProgress(callback: (operation: string, event: StructuredProgressEvent) => void): void;
  on2FARequest(callback: (payload: { portalId: string }) => void): void;
  submit2FACode(payload: { portalId: string; code: string | null }): void;
  removeAllListeners(channel: string): void;

  // --- Dark mode ---
  darkModeShouldUseDark(): Promise<boolean>;
  darkModeSetTheme(theme: ThemePreference): Promise<boolean>;
  onDarkModeUpdated(callback: (isDark: boolean) => void): void;
}

interface Window {
  electronAPI: ElectronAPI;
}
