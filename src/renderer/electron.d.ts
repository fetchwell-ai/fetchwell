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

interface Settings {
  downloadFolder: string;
  showBrowser: boolean;
  incrementalExtraction: boolean;
  apiKeyConfigured: boolean;
}

interface ElectronAPI {
  getPortals(): Promise<PortalEntry[]>;
  addPortal(input: PortalInput): Promise<PortalEntry>;
  updatePortal(id: string, updates: Partial<PortalInput>): Promise<PortalEntry>;
  removePortal(id: string): Promise<void>;
  getSettings(): Promise<Settings>;
  updateSettings(updates: Partial<Settings & { apiKey?: string }>): Promise<void>;
  validateApiKey(key: string): Promise<boolean>;
  runDiscovery(portalId: string): Promise<void>;
  runExtraction(portalId: string): Promise<void>;
  chooseFolder(): Promise<string | null>;
  openInFinder(folderPath: string): Promise<void>;
  onProgress(callback: (message: string) => void): void;
  onComplete(callback: (operation: string, data: { portalId: string }) => void): void;
  onError(callback: (operation: string, data: { type: string; category: string; message: string; suggestion: string }) => void): void;
  on2FARequest(callback: (payload: { portalId: string }) => void): void;
  submit2FACode(payload: { portalId: string; code: string | null }): void;
  removeAllListeners(channel: string): void;
}

interface Window {
  electronAPI: ElectronAPI;
}
