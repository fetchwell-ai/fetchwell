import * as path from 'path';
import { ipcMain, safeStorage, app, BrowserWindow, dialog, shell } from 'electron';
import { z } from 'zod';
import { ConfigManager, PortalEntry, PortalInputSchema, PortalInput } from './config';
import { CredentialsManager, SafeStorageBackend, validateApiKeyFormat } from './credentials';
import { runExtraction, cancelOperation, CategoryCounts } from './pipeline-bridge';
import { getBundledApiKey, hasBundledApiKey } from './bundled-key';

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

  ipcMain.handle('addPortal', (_event, rawInput: unknown): PortalEntry => {
    let input: PortalInput;
    try {
      input = PortalInputSchema.parse(rawInput);
    } catch (err) {
      throw new Error(`Invalid portal input: ${(err as Error).message}`, { cause: err });
    }

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

  ipcMain.handle('updatePortal', (_event, id: string, rawUpdates: unknown): PortalEntry => {
    let updates: Partial<PortalInput>;
    try {
      updates = PortalInputSchema.partial().parse(rawUpdates);
    } catch (err) {
      throw new Error(`Invalid portal update input: ${(err as Error).message}`, { cause: err });
    }

    const configUpdates: Partial<Omit<PortalEntry, 'id'>> = {};

    if (updates.name !== undefined) configUpdates.name = updates.name;
    if (updates.url !== undefined) configUpdates.url = updates.url;
    if (updates.loginForm !== undefined) configUpdates.loginForm = updates.loginForm ?? 'auto';
    if (updates.twoFactor !== undefined) configUpdates.twoFactor = updates.twoFactor;

    if (updates.username !== undefined && updates.password !== undefined) {
      // Full credential update: new username + new password
      creds().setPortalCredentials(id, {
        username: updates.username,
        password: updates.password,
      });
      configUpdates.hasCredentials = true;
    } else if (updates.username !== undefined) {
      // Username-only update: re-use the existing password
      const existing = creds().getPortalCredentials(id);
      if (existing) {
        creds().setPortalCredentials(id, {
          username: updates.username,
          password: existing.password,
        });
        configUpdates.hasCredentials = true;
      }
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

  const UpdateSettingsSchema = z.object({
    downloadFolder: z.string().refine((v) => path.isAbsolute(v), {
      message: 'downloadFolder must be an absolute path',
    }).optional(),
    showBrowser: z.boolean().optional(),
    incrementalExtraction: z.boolean().optional(),
    theme: z.enum(['system', 'light', 'dark']).optional(),
    apiKeySource: z.enum(['bundled', 'custom']).optional(),
    apiKey: z.string().regex(/^sk-ant-/, { message: 'apiKey must start with sk-ant-' }).optional(),
  });

  ipcMain.handle('updateSettings', (_event, rawUpdates: unknown): void => {
    let updates: z.infer<typeof UpdateSettingsSchema>;
    try {
      updates = UpdateSettingsSchema.parse(rawUpdates);
    } catch (err) {
      throw new Error(`Invalid settings update: ${(err as Error).message}`, { cause: err });
    }

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

  ipcMain.handle('runExtraction', async (_event, rawPortalId: unknown): Promise<void> => {
    let portalId: string;
    try {
      portalId = z.string().min(1, 'portalId must not be empty').parse(rawPortalId);
    } catch (err) {
      throw new Error(`Invalid runExtraction argument: ${(err as Error).message}`, { cause: err });
    }

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
      const customKey = creds().getApiKey(); // throws if decryption fails
      if (!customKey) throw new Error('API key not configured — add one in Settings.');
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

  ipcMain.handle('openInFinder', async (_event, rawPath: unknown): Promise<void> => {
    let folderPath: string;
    try {
      folderPath = z.string().min(1).parse(rawPath);
    } catch (err) {
      throw new Error(`Invalid openInFinder argument: ${(err as Error).message}`, { cause: err });
    }
    const downloadFolder = config().getSettings().downloadFolder;
    const normalizedPath = path.resolve(folderPath);
    const normalizedDownload = path.resolve(downloadFolder);
    if (!normalizedPath.startsWith(normalizedDownload + path.sep) && normalizedPath !== normalizedDownload) {
      throw new Error('openInFinder: path is outside the configured download folder');
    }
    await shell.openPath(normalizedPath);
  });

  // --- Reveal in Finder (select/highlight the item) ---

  ipcMain.handle('revealInFinder', (_event, rawPath: unknown): void => {
    let folderPath: string;
    try {
      folderPath = z.string().min(1).parse(rawPath);
    } catch (err) {
      throw new Error(`Invalid revealInFinder argument: ${(err as Error).message}`, { cause: err });
    }
    const downloadFolder = config().getSettings().downloadFolder;
    const normalizedPath = path.resolve(folderPath);
    const normalizedDownload = path.resolve(downloadFolder);
    if (!normalizedPath.startsWith(normalizedDownload + path.sep) && normalizedPath !== normalizedDownload) {
      throw new Error('revealInFinder: path is outside the configured download folder');
    }
    shell.showItemInFolder(normalizedPath);
  });

  // --- Portal credentials (read-only for display — password never sent to renderer) ---

  ipcMain.handle('getPortalCredentials', (_event, portalId: string): { username: string; hasPassword: boolean } | null => {
    const portalCreds = creds().getPortalCredentials(portalId);
    if (!portalCreds) return null;
    return {
      username: portalCreds.username,
      hasPassword: portalCreds.password.length > 0,
    };
  });

}
