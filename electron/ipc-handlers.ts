import { ipcMain, safeStorage, app, BrowserWindow, dialog, shell } from 'electron';
import { ConfigManager, PortalEntry, ThemePreference } from './config';
import { CredentialsManager, SafeStorageBackend, validateApiKeyFormat } from './credentials';
import { runExtraction, runDiscovery } from './pipeline-bridge';

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
  const dataPath = userDataPath ?? process.env.HRF_USER_DATA_PATH ?? app.getPath('userData');

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
    theme?: ThemePreference;
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

  // --- Pipeline operations ---

  ipcMain.handle('runExtraction', async (_event, portalId: string): Promise<void> => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error('No active window');

    const portal = configManager!.getPortal(portalId);
    if (!portal) throw new Error(`Portal not found: ${portalId}`);

    const settings = configManager!.getSettings();
    const apiKey = credentialsManager!.getApiKey();
    if (!apiKey) throw new Error('API key not configured');

    const creds = credentialsManager!.getPortalCredentials(portalId);
    if (!creds) throw new Error(`No credentials stored for portal: ${portalId}`);

    try {
      await runExtraction(portalId, win, {
        apiKey,
        credentials: creds,
        portalUrl: portal.url,
        portalId: portal.id,
        portalName: portal.name,
        downloadFolder: settings.downloadFolder,
        showBrowser: settings.showBrowser,
        incremental: settings.incrementalExtraction,
        loginForm: portal.loginForm,
        twoFactor: portal.twoFactor,
      });
      configManager!.updatePortal(portalId, { lastExtractedAt: new Date().toISOString() });
    } catch {
      // Error already sent to renderer via IPC event
    }
  });

  // --- Folder picker ---

  ipcMain.handle('chooseFolder', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  // --- Open in Finder ---

  ipcMain.handle('openInFinder', async (_event, folderPath: string): Promise<void> => {
    await shell.openPath(folderPath);
  });

  // --- Reveal in Finder (select/highlight the item) ---

  ipcMain.handle('revealInFinder', (_event, folderPath: string): void => {
    shell.showItemInFolder(folderPath);
  });

  // --- Portal credentials (read-only for display) ---

  ipcMain.handle('getPortalCredentials', (_event, portalId: string): { username: string; password: string } | null => {
    return credentialsManager!.getPortalCredentials(portalId);
  });

  ipcMain.handle('runDiscovery', async (_event, portalId: string): Promise<void> => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error('No active window');

    const portal = configManager!.getPortal(portalId);
    if (!portal) throw new Error(`Portal not found: ${portalId}`);

    const settings = configManager!.getSettings();
    const apiKey = credentialsManager!.getApiKey();
    if (!apiKey) throw new Error('API key not configured');

    const creds = credentialsManager!.getPortalCredentials(portalId);
    if (!creds) throw new Error(`No credentials stored for portal: ${portalId}`);

    try {
      await runDiscovery(portalId, win, {
        apiKey,
        credentials: creds,
        portalUrl: portal.url,
        portalId: portal.id,
        portalName: portal.name,
        downloadFolder: settings.downloadFolder,
        showBrowser: settings.showBrowser,
        incremental: settings.incrementalExtraction,
        loginForm: portal.loginForm,
        twoFactor: portal.twoFactor,
      });
      configManager!.updatePortal(portalId, { discoveredAt: new Date().toISOString() });
    } catch {
      // Error already sent to renderer via IPC event
    }
  });
}
