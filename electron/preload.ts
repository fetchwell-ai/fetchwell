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
  onProgress: (callback: (message: string) => void) => {
    ipcRenderer.on('extraction:log', (_event, message: string) => callback(message));
    ipcRenderer.on('discovery:log', (_event, message: string) => callback(message));
  },
  onComplete: (callback: (operation: string, data: { portalId: string }) => void) => {
    ipcRenderer.on('extraction:complete', (_event, data: { portalId: string }) => callback('extraction', data));
    ipcRenderer.on('discovery:complete', (_event, data: { portalId: string }) => callback('discovery', data));
  },
  onError: (callback: (operation: string, data: { type: string; category: string; message: string; suggestion: string }) => void) => {
    ipcRenderer.on('extraction:error', (_event, data: { type: string; category: string; message: string; suggestion: string }) => callback('extraction', data));
    ipcRenderer.on('discovery:error', (_event, data: { type: string; category: string; message: string; suggestion: string }) => callback('discovery', data));
  },
  onStructuredProgress: (callback: (operation: string, event: unknown) => void) => {
    ipcRenderer.on('extraction:progress', (_event, data: unknown) => callback('extraction', data));
    ipcRenderer.on('discovery:progress', (_event, data: unknown) => callback('discovery', data));
  },

  // --- 2FA ---
  on2FARequest: (callback: (payload: { portalId: string }) => void) => {
    ipcRenderer.on('2fa:request', (_event, data: { portalId: string }) => callback(data));
  },
  submit2FACode: (payload: { portalId: string; code: string | null }) => {
    ipcRenderer.send('2fa:submit', payload);
  },

  // --- Cleanup ---
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // --- Dark mode ---
  darkModeShouldUseDark: () => ipcRenderer.invoke('darkMode:shouldUseDark'),
  darkModeSetTheme: (theme: 'system' | 'light' | 'dark') => ipcRenderer.invoke('darkMode:setTheme', theme),
  onDarkModeUpdated: (callback: (isDark: boolean) => void) => {
    ipcRenderer.on('darkMode:updated', (_event, isDark: boolean) => callback(isDark));
  },
});
