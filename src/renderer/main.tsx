import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';

// Apply dark class to <html> based on current nativeTheme state.
// We do this before rendering to avoid a flash of wrong theme.
async function applyInitialTheme() {
  try {
    const settings = await window.electronAPI.getSettings();
    // Set nativeTheme.themeSource so Electron honors the stored preference
    await window.electronAPI.darkModeSetTheme(settings.theme ?? 'system');
    const isDark = await window.electronAPI.darkModeShouldUseDark();
    document.documentElement.classList.toggle('dark', isDark);
  } catch {
    // Fallback: leave no dark class (light mode)
  }

  // Subscribe to system appearance changes
  window.electronAPI.onDarkModeUpdated((isDark) => {
    document.documentElement.classList.toggle('dark', isDark);
  });
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

applyInitialTheme().then(() => {
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
