import { app, BrowserWindow, nativeTheme, ipcMain } from 'electron';
import * as path from 'path';
import { autoUpdater } from 'electron-updater';
import { registerIpcHandlers } from './ipc-handlers';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'));
}

app.whenReady().then(() => {
  registerIpcHandlers();

  // --- Dark mode IPC ---

  // Renderer asks: "should we use dark colors right now?"
  ipcMain.handle('darkMode:shouldUseDark', () => {
    return nativeTheme.shouldUseDarkColors;
  });

  // Renderer tells us the user's theme preference so we can update nativeTheme.themeSource
  ipcMain.handle('darkMode:setTheme', (_event, theme: 'system' | 'light' | 'dark') => {
    nativeTheme.themeSource = theme;
    return nativeTheme.shouldUseDarkColors;
  });

  createWindow();

  // Check for updates via GitHub Releases (silent — no blocking dialogs).
  // In development (non-packaged) this is a no-op; electron-updater skips
  // when there is no app-update.yml present.
  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    // Silently ignore update-check failures (offline, no releases, etc.)
  });

  // When system appearance changes, push updated value to all windows
  nativeTheme.on('updated', () => {
    const isDark = nativeTheme.shouldUseDarkColors;
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('darkMode:updated', isDark);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
