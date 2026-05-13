import { app, BrowserWindow, nativeTheme, ipcMain, nativeImage, dialog, net } from 'electron';
import * as path from 'path';
import { autoUpdater } from 'electron-updater';
import { registerIpcHandlers } from './ipc-handlers';
import { isVersionBelow } from './version-check';

// ---------------------------------------------------------------------------
// Minimum version gate — fetches min-version.json from GitHub on startup
// ---------------------------------------------------------------------------
async function checkMinimumVersion(): Promise<void> {
  try {
    const response = await net.fetch(
      'https://raw.githubusercontent.com/fetchwell-ai/fetchwell/main/min-version.json'
    );
    if (!response.ok) return; // non-2xx → silently skip

    const data = (await response.json()) as { minVersion?: unknown };
    const minVersion = data?.minVersion;
    if (typeof minVersion !== 'string') return;

    const currentVersion = app.getVersion();
    if (!isVersionBelow(currentVersion, minVersion)) return;

    // Current version is below minimum — show blocking dialog
    const win = BrowserWindow.getAllWindows()[0];
    const { response: choice } = await dialog.showMessageBox(win ?? new BrowserWindow({ show: false }), {
      type: 'warning',
      title: 'Update Required',
      message: 'A required update is available. Please update Fetchwell to continue.',
      buttons: ['Update now', 'Quit'],
      defaultId: 0,
      cancelId: 1,
    });

    if (choice === 1) {
      app.quit();
      return;
    }

    // "Update now" chosen
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    await dialog.showMessageBox(win ?? new BrowserWindow({ show: false }), {
      type: 'info',
      title: 'Downloading Update',
      message: 'Downloading update... The app will restart when ready.',
      buttons: ['OK'],
    });
  } catch {
    // Network error, parse error, etc. — silently continue
  }
}

// ---------------------------------------------------------------------------
// Playwright browser path — must be set before any browser launch
// ---------------------------------------------------------------------------
// When running from the packaged DMG, Playwright cannot find Chromium in its
// default cache (~/.cache or ~/Library/Caches/ms-playwright/) because end-user
// machines won't have it. electron-builder copies the Chromium binary into
// Contents/Resources/ms-playwright/ (see electron-builder.yml extraResources).
// We point PLAYWRIGHT_BROWSERS_PATH there so both this process and any
// subprocess (pipeline-bridge forks src/electron-runner.ts) can find it.
// In dev (app.isPackaged === false) we leave the env var unset so the normal
// developer cache in ~/Library/Caches/ms-playwright/ is used.
if (app.isPackaged) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(process.resourcesPath, 'ms-playwright');
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hiddenInset',
    icon: path.join(__dirname, '..', 'build', 'icon.icns'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'));
}

app.setName('Fetchwell');

app.whenReady().then(async () => {
  // Set dock icon for dev mode (macOS ignores BrowserWindow `icon`)
  if (process.platform === 'darwin' && app.dock) {
    const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
    const img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) app.dock.setIcon(img);
  }

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

  // Minimum version gate: blocks the app if running an outdated version.
  // Must run after createWindow() so the dialog has a parent window.
  // If offline or the fetch fails, the app continues normally.
  await checkMinimumVersion();

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
