import { ipcMain, safeStorage, app } from 'electron';
import { ConfigManager, PortalEntry } from './config';
import { CredentialsManager, SafeStorageBackend, validateApiKeyFormat } from './credentials';

/** Input shape for adding/updating a portal (id is derived from name). */
interface PortalInput {
  name: string;
  url: string;
  loginForm: 'two-step' | 'single-page';
  twoFactor: 'none' | 'email' | 'manual' | 'ui';
  username?: string;
  password?: string;
}

let configManager: ConfigManager | null = null;
let credentialsManager: CredentialsManager | null = null;

/**
 * Register all IPC handlers.
 * Call this once from main.ts after `app.whenReady()`.
 *
 * The optional `userDataPath` parameter exists so unit tests can inject
 * a temp directory without a running Electron app.
 */
export function registerIpcHandlers(userDataPath?: string): void {
  const dataPath = userDataPath ?? app.getPath('userData');

  const safeStorageBackend: SafeStorageBackend = {
    isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
    encryptString: (plaintext: string) => safeStorage.encryptString(plaintext),
    decryptString: (encrypted: Buffer) => safeStorage.decryptString(encrypted),
  };

  configManager = new ConfigManager(dataPath);
  credentialsManager = new CredentialsManager(dataPath, safeStorageBackend);

  // --- Portal management ---

  ipcMain.handle('getPortals', (): PortalEntry[] => {
    return configManager!.getPortals();
  });

  ipcMain.handle('addPortal', (_event, input: PortalInput): PortalEntry => {
    const entry = configManager!.addPortal({
      name: input.name,
      url: input.url,
      loginForm: input.loginForm,
      twoFactor: input.twoFactor,
    });

    if (input.username !== undefined && input.password !== undefined) {
      credentialsManager!.setPortalCredentials(entry.id, {
        username: input.username,
        password: input.password,
      });
      configManager!.updatePortal(entry.id, { hasCredentials: true });
      return { ...entry, hasCredentials: true };
    }

    return entry;
  });

  ipcMain.handle('updatePortal', (_event, id: string, updates: Partial<PortalInput>): PortalEntry => {
    const configUpdates: Partial<Omit<PortalEntry, 'id'>> = {};

    if (updates.name !== undefined) configUpdates.name = updates.name;
    if (updates.url !== undefined) configUpdates.url = updates.url;
    if (updates.loginForm !== undefined) configUpdates.loginForm = updates.loginForm;
    if (updates.twoFactor !== undefined) configUpdates.twoFactor = updates.twoFactor;

    if (updates.username !== undefined && updates.password !== undefined) {
      credentialsManager!.setPortalCredentials(id, {
        username: updates.username,
        password: updates.password,
      });
      configUpdates.hasCredentials = true;
    }

    return configManager!.updatePortal(id, configUpdates);
  });

  ipcMain.handle('removePortal', (_event, id: string): void => {
    configManager!.removePortal(id);
    credentialsManager!.clearPortalCredentials(id);
  });

  // --- Settings ---

  ipcMain.handle('getSettings', () => {
    const settings = configManager!.getSettings();
    return {
      ...settings,
      apiKeyConfigured: credentialsManager!.hasApiKey(),
    };
  });

  ipcMain.handle('updateSettings', (_event, updates: {
    downloadFolder?: string;
    showBrowser?: boolean;
    incrementalExtraction?: boolean;
    apiKey?: string;
  }): void => {
    const { apiKey, ...configUpdates } = updates;

    if (Object.keys(configUpdates).length > 0) {
      configManager!.updateSettings(configUpdates);
    }

    if (apiKey !== undefined) {
      credentialsManager!.setApiKey(apiKey);
    }
  });

  // --- API key validation ---

  ipcMain.handle('validateApiKey', (_event, key: string): boolean => {
    return validateApiKeyFormat(key);
  });
}
