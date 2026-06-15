import { useEffect, useState } from 'react';

/**
 * Fetches app settings from the Electron main process.
 * Returns the settings object plus a loading flag.
 * Individual settings pages can call this instead of duplicating
 * the getSettings() fetch/loading pattern.
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI
      .getSettings()
      .then((s) => {
        setSettings(s);
      })
      .catch(() => {
        // Leave settings as null — callers should guard on null/loading
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return { settings, loading };
}

/**
 * Returns `savedVisible` state and a `showSaved()` trigger that
 * auto-hides the confirmation after 1800 ms. Used for the inline
 * "Saved" confirmation labels that appear next to Save buttons.
 */
export function useSavedFeedback(durationMs = 1800) {
  const [savedVisible, setSavedVisible] = useState(false);

  const showSaved = () => {
    setSavedVisible(true);
    setTimeout(() => setSavedVisible(false), durationMs);
  };

  return { savedVisible, showSaved };
}
