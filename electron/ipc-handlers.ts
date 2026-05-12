import { ipcMain, safeStorage, app, BrowserWindow, dialog, shell } from 'electron';
import { ConfigManager, PortalEntry, ThemePreference, ApiKeySource } from './config';
import { CredentialsManager, SafeStorageBackend, validateApiKeyFormat } from './credentials';
import { runExtraction, cancelOperation, CategoryCounts } from './pipeline-bridge';
import { getBundledApiKey, hasBundledApiKey } from './bundled-key';

/** Input shape for adding/updating a portal (id is derived from name). */
interface PortalInput {
  name: string;
  url: string;
  loginForm?: 'two-step' | 'single-page' | 'auto';
  twoFactor: 'none' | 'email' | 'manual' | 'ui';
  username?: string;
  password?: string;
}

let configManager: ConfigManager | null = null;
let credentialsManager: CredentialsManager | null = null;

function config(): ConfigManager {
  if (!configManager) throw new Error('IPC handlers called before initialization');
  return configManager;
}
function creds(): CredentialsManager {
  if (!credentialsManager) throw new Error('IPC handlers called before initialization');
  return credentialsManager;
}

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
    return config().getPortals();
  });

  ipcMain.handle('addPortal', (_event, input: PortalInput): PortalEntry => {
    const entry = config().addPortal({
      name: input.name,
      url: input.url,
      loginForm: input.loginForm ?? 'auto',
      twoFactor: input.twoFactor,
    });

    if (input.username !== undefined && input.password !== undefined) {
      creds().setPortalCredentials(entry.id, {
        username: input.username,
        password: input.password,
      });
      config().updatePortal(entry.id, { hasCredentials: true });
      return { ...entry, hasCredentials: true };
    }

    return entry;
  });

  ipcMain.handle('updatePortal', (_event, id: string, updates: Partial<PortalInput>): PortalEntry => {
    const configUpdates: Partial<Omit<PortalEntry, 'id'>> = {};

    if (updates.name !== undefined) configUpdates.name = updates.name;
    if (updates.url !== undefined) configUpdates.url = updates.url;
    if (updates.loginForm !== undefined) configUpdates.loginForm = updates.loginForm ?? 'auto';
    if (updates.twoFactor !== undefined) configUpdates.twoFactor = updates.twoFactor;

    if (updates.username !== undefined && updates.password !== undefined) {
      creds().setPortalCredentials(id, {
        username: updates.username,
        password: updates.password,
      });
      configUpdates.hasCredentials = true;
    }

    return config().updatePortal(id, configUpdates);
  });

  ipcMain.handle('removePortal', (_event, id: string): void => {
    config().removePortal(id);
    creds().clearPortalCredentials(id);
  });

  // --- Settings ---

  ipcMain.handle('getSettings', () => {
    const settings = config().getSettings();
    const apiKeySource = settings.apiKeySource;
    const apiKeyConfigured =
      apiKeySource === 'bundled'
        ? hasBundledApiKey()
        : creds().hasApiKey();
    return {
      ...settings,
      apiKeyConfigured,
    };
  });

  ipcMain.handle('updateSettings', (_event, updates: {
    downloadFolder?: string;
    showBrowser?: boolean;
    incrementalExtraction?: boolean;
    theme?: ThemePreference;
    apiKeySource?: ApiKeySource;
    apiKey?: string;
  }): void => {
    const { apiKey, ...configUpdates } = updates;

    if (Object.keys(configUpdates).length > 0) {
      config().updateSettings(configUpdates);
    }

    if (apiKey !== undefined) {
      creds().setApiKey(apiKey);
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

    const portal = config().getPortal(portalId);
    if (!portal) throw new Error(`Portal not found: ${portalId}`);

    const settings = config().getSettings();
    let apiKey: string;
    if (settings.apiKeySource === 'bundled') {
      apiKey = getBundledApiKey();
      if (!apiKey) throw new Error('No bundled API key available. Run scripts/encode-key.ts at build time.');
    } else {
      const customKey = creds().getApiKey();
      if (!customKey) throw new Error('API key not configured');
      apiKey = customKey;
    }

    const portalCreds = creds().getPortalCredentials(portalId);
    if (!portalCreds) throw new Error(`No credentials stored for portal: ${portalId}`);

    try {
      const counts: CategoryCounts = await runExtraction(portalId, win, {
        apiKey,
        credentials: portalCreds,
        portalUrl: portal.url,
        portalId: portal.id,
        portalName: portal.name,
        downloadFolder: settings.downloadFolder,
        showBrowser: settings.showBrowser,
        incremental: settings.incrementalExtraction,
        loginForm: portal.loginForm,
        twoFactor: portal.twoFactor,
      });
      const countUpdate: Partial<PortalEntry> = {
        lastExtractedAt: new Date().toISOString(),
      };
      // Only update counts that are > 0 — incremental runs report 0 for
      // categories with no new items, and we don't want to erase prior totals.
      if (counts.labCount > 0) countUpdate.labCount = counts.labCount;
      if (counts.visitCount > 0) countUpdate.visitCount = counts.visitCount;
      if (counts.medicationCount > 0) countUpdate.medicationCount = counts.medicationCount;
      if (counts.messageCount > 0) countUpdate.messageCount = counts.messageCount;
      config().updatePortal(portalId, countUpdate);
    } catch {
      // Error already sent to renderer via IPC event
    }
  });

  // --- Cancel operation ---

  ipcMain.handle('cancelOperation', (_event, portalId: string): boolean => {
    return cancelOperation(portalId);
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
    return creds().getPortalCredentials(portalId);
  });

}
