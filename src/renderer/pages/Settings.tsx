import React, { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { Checkbox } from '../components/ui/checkbox';
import { cn } from '../lib/utils';

interface SettingsProps {
  onBack: () => void;
}

type ThemeOption = 'system' | 'light' | 'dark';

const THEME_OPTIONS: { value: ThemeOption; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function Settings({ onBack }: SettingsProps) {
  const [downloadFolder, setDownloadFolder] = useState('');
  const [showBrowser, setShowBrowser] = useState(false);
  const [incrementalExtraction, setIncrementalExtraction] = useState(true);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [theme, setTheme] = useState<ThemeOption>('system');
  const [loading, setLoading] = useState(true);

  // API key editing state
  const [editingApiKey, setEditingApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [apiKeyValidating, setApiKeyValidating] = useState(false);

  // Saved feedback
  const [savedLabel, setSavedLabel] = useState<string | null>(null);

  const showSaved = (label: string) => {
    setSavedLabel(label);
    setTimeout(() => setSavedLabel(null), 1800);
  };

  useEffect(() => {
    window.electronAPI
      .getSettings()
      .then((settings) => {
        setDownloadFolder(settings.downloadFolder);
        setShowBrowser(settings.showBrowser);
        setIncrementalExtraction(settings.incrementalExtraction);
        setApiKeyConfigured(settings.apiKeyConfigured);
        setTheme(settings.theme ?? 'system');
      })
      .catch(() => {
        // ignore -- defaults remain
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // --- API Key handlers ---

  const handleStartEditApiKey = () => {
    setApiKeyInput('');
    setApiKeyError(null);
    setEditingApiKey(true);
  };

  const handleCancelEditApiKey = () => {
    setEditingApiKey(false);
    setApiKeyInput('');
    setApiKeyError(null);
  };

  const handleSaveApiKey = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setApiKeyError('API key is required');
      return;
    }
    setApiKeyError(null);
    setApiKeyValidating(true);
    try {
      const valid = await window.electronAPI.validateApiKey(trimmed);
      if (!valid) {
        setApiKeyError('Invalid API key format. Make sure it starts with sk-ant-');
        return;
      }
      await window.electronAPI.updateSettings({ apiKey: trimmed });
      setApiKeyConfigured(true);
      setEditingApiKey(false);
      setApiKeyInput('');
      showSaved('api-key');
    } catch {
      setApiKeyError('An error occurred while saving. Try again.');
    } finally {
      setApiKeyValidating(false);
    }
  };

  // --- Download folder handler ---

  const handleChooseFolder = async () => {
    const chosen = await window.electronAPI.chooseFolder();
    if (chosen !== null) {
      setDownloadFolder(chosen);
      await window.electronAPI.updateSettings({ downloadFolder: chosen });
      showSaved('folder');
    }
  };

  // --- Toggle handlers ---

  const handleShowBrowserToggle = async () => {
    const next = !showBrowser;
    setShowBrowser(next);
    await window.electronAPI.updateSettings({ showBrowser: next });
    showSaved('show-browser');
  };

  const handleIncrementalToggle = async () => {
    const next = !incrementalExtraction;
    setIncrementalExtraction(next);
    await window.electronAPI.updateSettings({ incrementalExtraction: next });
    showSaved('incremental');
  };

  // --- Theme handler ---

  const handleThemeChange = async (newTheme: ThemeOption) => {
    setTheme(newTheme);
    // Tell Electron to update nativeTheme.themeSource and get new isDark value
    const isDark = await window.electronAPI.darkModeSetTheme(newTheme);
    document.documentElement.classList.toggle('dark', isDark);
    await window.electronAPI.updateSettings({ theme: newTheme });
    showSaved('theme');
  };

  if (loading) return null;

  return (
    <div className="mx-auto w-full max-w-[640px] flex-1 px-10 py-8">
      <div className="mb-7 flex items-center gap-4">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onBack}
        >
          Back
        </Button>
        <h1 className="m-0 text-[22px] font-semibold text-[var(--color-fw-fg)]">Settings</h1>
      </div>

      <div className="flex flex-col gap-4">

        {/* Appearance section */}
        <Card className="px-6 py-5">
          <div className="mb-3.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--color-fw-fg-muted)]">
            Appearance
          </div>
          <div className="flex items-center gap-2">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleThemeChange(opt.value)}
                className={cn(
                  'flex-1 rounded-[var(--radius-md)] border px-3 py-2 text-[13px] font-medium transition-colors duration-[var(--fw-dur-fast)] cursor-pointer',
                  theme === opt.value
                    ? 'border-[var(--color-fw-primary)] bg-[var(--color-fw-primary-tint)] text-[var(--color-fw-primary)]'
                    : 'border-[var(--color-fw-border)] bg-transparent text-[var(--color-fw-fg-muted)] hover:bg-[var(--color-fw-bg-deep)]',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {savedLabel === 'theme' && (
            <p className="mt-2 text-xs font-medium text-[var(--color-fw-moss-600)]">Saved</p>
          )}
          <p className="mt-2 text-xs text-[var(--color-fw-fg-muted)]">
            System follows your macOS appearance setting.
          </p>
        </Card>

        {/* API Key section */}
        <Card className="px-6 py-5">
          <div className="mb-3.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--color-fw-fg-muted)]">
            API key
          </div>

          {!editingApiKey && apiKeyConfigured && (
            <div className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[14px] text-[var(--color-fw-fg)]">API key configured</span>
                <span className="text-[13px] tracking-[0.06em] text-[var(--color-fw-fg-muted)]">*****************</span>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                {savedLabel === 'api-key' && (
                  <span className="settings-saved text-xs font-medium text-[var(--color-fw-moss-600)]">Saved</span>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleStartEditApiKey}
                >
                  Change
                </Button>
              </div>
            </div>
          )}

          {(editingApiKey || !apiKeyConfigured) && (
            <div className="mt-1">
              <div className="mb-5">
                <Label htmlFor="settings-api-key" className="mb-1.5">
                  {apiKeyConfigured ? 'New API key' : 'API key'}
                </Label>
                <Input
                  id="settings-api-key"
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => {
                    setApiKeyInput(e.target.value);
                    setApiKeyError(null);
                  }}
                  placeholder="sk-ant-..."
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="mt-1 text-xs text-[var(--color-fw-fg-muted)]">
                  Starts with sk-ant-. Get one at{' '}
                  <strong>console.anthropic.com</strong>
                </p>
                {apiKeyError && <p className="mt-1 text-xs text-[var(--color-fw-crimson-600)]">{apiKeyError}</p>}
              </div>
              <div className="flex justify-end gap-2">
                {apiKeyConfigured && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleCancelEditApiKey}
                    disabled={apiKeyValidating}
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveApiKey}
                  disabled={apiKeyValidating}
                >
                  {apiKeyValidating ? 'Validating...' : 'Save'}
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Download Folder section */}
        <Card className="px-6 py-5">
          <div className="mb-3.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--color-fw-fg-muted)]">
            Download folder
          </div>
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-fw-bg)] px-3 py-2.5">
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-[var(--color-fw-fg-muted)]">
                {downloadFolder || 'No folder selected'}
              </span>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              {savedLabel === 'folder' && (
                <span className="settings-saved text-xs font-medium text-[var(--color-fw-moss-600)]">Saved</span>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleChooseFolder}
              >
                Change
              </Button>
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--color-fw-fg-muted)]">
            Extracted PDFs will be saved to this folder.
          </p>
        </Card>

        {/* Browser Visibility section */}
        <Card className="px-6 py-5">
          <div className="mb-3.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--color-fw-fg-muted)]">
            Browser visibility
          </div>
          <div className="mb-2 flex items-center gap-3">
            <label className="flex flex-1 cursor-pointer items-center gap-2.5 text-[14px] text-[var(--color-fw-fg)]" htmlFor="show-browser">
              <Checkbox
                id="show-browser"
                checked={showBrowser}
                onChange={handleShowBrowserToggle}
              />
              <span>Show the browser while it works</span>
            </label>
            {savedLabel === 'show-browser' && (
              <span className="settings-saved text-xs font-medium text-[var(--color-fw-moss-600)]">Saved</span>
            )}
          </div>
          {showBrowser && (
            <p className="settings-warning m-1 rounded-[var(--radius-sm)] bg-[var(--color-fw-ochre-100)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--color-fw-ochre-600)]">
              When enabled, a browser window will be visible during portal
              operations. This is useful for debugging but may be distracting
              during normal use.
            </p>
          )}
        </Card>

        {/* Incremental Extraction section */}
        <Card className="px-6 py-5">
          <div className="mb-3.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--color-fw-fg-muted)]">
            Extraction mode
          </div>
          <div className="flex items-center gap-3">
            <label className="flex flex-1 cursor-pointer items-center gap-2.5 text-[14px] text-[var(--color-fw-fg)]" htmlFor="incremental-extraction">
              <Checkbox
                id="incremental-extraction"
                checked={incrementalExtraction}
                onChange={handleIncrementalToggle}
              />
              <span>Incremental extraction</span>
            </label>
            {savedLabel === 'incremental' && (
              <span className="settings-saved text-xs font-medium text-[var(--color-fw-moss-600)]">Saved</span>
            )}
          </div>
          <p className="mt-2 text-xs text-[var(--color-fw-fg-muted)]">
            When enabled, only fetch records newer than the last extraction.
            Disable to re-fetch all records.
          </p>
        </Card>

        {/* API costs note */}
        <Card className="bg-[var(--color-fw-bg)] px-6 py-5">
          <div className="mb-3.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--color-fw-fg-muted)]">
            API usage and costs
          </div>
          <p className="m-0 text-[13px] leading-relaxed text-[var(--color-fw-fg-muted)]">
            API usage is billed directly by Anthropic. Typical cost: a few
            dollars per extraction run. Manage your API key at{' '}
            <strong>console.anthropic.com</strong>.
          </p>
        </Card>

      </div>
    </div>
  );
}
