import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // --- Portal management ---
  getPortals: () => ipcRenderer.invoke('getPortals'),
  addPortal: (input: unknown) => ipcRenderer.invoke('addPortal', input),
  updatePortal: (id: string, updates: unknown) => ipcRenderer.invoke('updatePortal', id, updates),
  removePortal: (id: string) => ipcRenderer.invoke('removePortal', id),

  // --- Settings ---
  getSettings: () => ipcRenderer.invoke('getSettings'),
  updateSettings: (updates: unknown) => ipcRenderer.invoke('updateSettings', updates),

  // --- Validation ---
  validateApiKey: (key: string) => ipcRenderer.invoke('validateApiKey', key),

  // --- Pipeline operations ---
  runExtraction: (portalId: string) => ipcRenderer.invoke('runExtraction', portalId),
  cancelOperation: (portalId: string) => ipcRenderer.invoke('cancelOperation', portalId),

  // --- Folder picker ---
  chooseFolder: () => ipcRenderer.invoke('chooseFolder'),

  // --- Open in Finder ---
  openInFinder: (folderPath: string) => ipcRenderer.invoke('openInFinder', folderPath),

  // --- Reveal in Finder (select/highlight the item) ---
  revealInFinder: (folderPath: string) => ipcRenderer.invoke('revealInFinder', folderPath),

  // --- Portal credentials (read-only for display) ---
  getPortalCredentials: (portalId: string) => ipcRenderer.invoke('getPortalCredentials', portalId),

  // --- Progress event listeners ---
  // Each on* helper registers listeners and returns an unsubscribe function
  // that removes exactly those listeners (not all listeners on those channels).
  onProgress: (callback: (message: string) => void): (() => void) => {
    const logHandler = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on('extraction:log', logHandler);
    return () => {
      ipcRenderer.removeListener('extraction:log', logHandler);
    };
  },
  onComplete: (callback: (operation: string, data: { portalId: string }) => void): (() => void) => {
    const extractionHandler = (_event: Electron.IpcRendererEvent, data: { portalId: string }) => callback('extraction', data);
    ipcRenderer.on('extraction:complete', extractionHandler);
    return () => {
      ipcRenderer.removeListener('extraction:complete', extractionHandler);
    };
  },
  onError: (callback: (operation: string, data: { type: string; category: string; message: string; suggestion: string }) => void): (() => void) => {
    const extractionHandler = (_event: Electron.IpcRendererEvent, data: { type: string; category: string; message: string; suggestion: string }) => callback('extraction', data);
    ipcRenderer.on('extraction:error', extractionHandler);
    return () => {
      ipcRenderer.removeListener('extraction:error', extractionHandler);
    };
  },
  onStructuredProgress: (callback: (operation: string, event: unknown) => void): (() => void) => {
    const extractionHandler = (_event: Electron.IpcRendererEvent, data: unknown) => callback('extraction', data);
    ipcRenderer.on('extraction:progress', extractionHandler);
    return () => {
      ipcRenderer.removeListener('extraction:progress', extractionHandler);
    };
  },

  // --- 2FA ---
  on2FARequest: (callback: (payload: { portalId: string; twoFactorType: 'none' | 'email' | 'manual' | 'ui'; error?: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { portalId: string; twoFactorType: 'none' | 'email' | 'manual' | 'ui'; error?: string }) => callback(data);
    ipcRenderer.on('2fa:request', handler);
    return () => {
      ipcRenderer.removeListener('2fa:request', handler);
    };
  },
  on2FAResult: (callback: (payload: { portalId: string; success: boolean; error?: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { portalId: string; success: boolean; error?: string }) => callback(data);
    ipcRenderer.on('2fa:result', handler);
    return () => {
      ipcRenderer.removeListener('2fa:result', handler);
    };
  },
  submit2FACode: (payload: { portalId: string; code: string | null }) => {
    ipcRenderer.send('2fa:submit', payload);
  },

  // --- Dark mode ---
  darkModeShouldUseDark: () => ipcRenderer.invoke('darkMode:shouldUseDark'),
  darkModeSetTheme: (theme: 'system' | 'light' | 'dark') => ipcRenderer.invoke('darkMode:setTheme', theme),
  onDarkModeUpdated: (callback: (isDark: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, isDark: boolean) => callback(isDark);
    ipcRenderer.on('darkMode:updated', handler);
    return () => {
      ipcRenderer.removeListener('darkMode:updated', handler);
    };
  },
});
