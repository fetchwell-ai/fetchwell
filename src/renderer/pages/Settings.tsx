import React, { useEffect, useState } from 'react';
import { Monitor, Sun, Moon } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { Checkbox } from '../components/ui/checkbox';
import { cn } from '../lib/utils';

interface SettingsProps {
  onBack: () => void;
  /** Which settings sub-section to show. */
  activeKey?: string | null;
}

type ThemeOption = 'system' | 'light' | 'dark';

// ── Shared page wrapper ───────────────────────────────────────────────────────

interface PageLayoutProps {
  title: string;
  lede: string;
  children: React.ReactNode;
}

function PageLayout({ title, lede, children }: PageLayoutProps) {
  return (
    <div className="w-full max-w-[980px] px-8 py-10">
      <div className="mb-7">
        <h1
          className="m-0 mb-1 text-[32px] leading-[38px] font-medium tracking-[-0.012em] text-[var(--color-fw-ink-900)]"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {title}
        </h1>
        <p className="m-0 text-[14px] text-[var(--color-fw-fg-muted)] max-w-[540px]">
          {lede}
        </p>
      </div>
      {children}
    </div>
  );
}

// ── (a) Appearance ────────────────────────────────────────────────────────────

function AppearancePage() {
  const [theme, setTheme] = useState<ThemeOption>(() => {
    return (localStorage.getItem('fw-theme') as ThemeOption) ?? 'system';
  });

  const handleThemeChange = async (newTheme: ThemeOption) => {
    setTheme(newTheme);
    localStorage.setItem('fw-theme', newTheme);
    try {
      const isDark = await window.electronAPI.darkModeSetTheme(newTheme);
      document.documentElement.classList.toggle('dark', isDark);
      await window.electronAPI.updateSettings({ theme: newTheme });
    } catch {
      // Best-effort — UI already updated
    }
  };

  const SEGMENTS: { value: ThemeOption; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
    { value: 'system', label: 'System', Icon: Monitor },
    { value: 'light',  label: 'Light',  Icon: Sun },
    { value: 'dark',   label: 'Dark',   Icon: Moon },
  ];

  return (
    <PageLayout title="Appearance" lede="Match your system, or pick a side.">
      <Card className="max-w-[560px] px-6 py-5">
        <div
          className="grid gap-2 p-1 rounded-[var(--radius-md)] border border-[var(--color-fw-border)]"
          style={{
            gridTemplateColumns: 'repeat(3, 1fr)',
            background: 'var(--color-fw-bg-deep)',
          }}
        >
          {SEGMENTS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleThemeChange(value)}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-[6px] text-[13px] font-medium border cursor-pointer transition-colors duration-[var(--fw-dur-fast,120ms)]',
                theme === value
                  ? 'bg-[var(--color-fw-sage-100)] border-[var(--color-fw-border-focus)] text-[var(--color-fw-ink-900)]'
                  : 'bg-transparent border-transparent text-[var(--color-fw-ink-700)] hover:text-[var(--color-fw-ink-900)] hover:bg-[var(--color-fw-card-bg)]',
              )}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-[var(--color-fw-fg-muted)]">
          System follows your macOS appearance.
        </p>
      </Card>
    </PageLayout>
  );
}

// ── (b) Anthropic API key ─────────────────────────────────────────────────────

type ApiKeySourceOption = ApiKeySource;

const API_KEY_SEGMENTS: { value: ApiKeySourceOption; label: string }[] = [
  { value: 'bundled', label: "FetchWell's key" },
  { value: 'custom',  label: 'Your own key' },
];

function ApiKeyPage() {
  const [apiKeySource, setApiKeySource] = useState<ApiKeySourceOption>('bundled');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [editingApiKey, setEditingApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [apiKeyValidating, setApiKeyValidating] = useState(false);
  const [savedVisible, setSavedVisible] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI
      .getSettings()
      .then((settings) => {
        setApiKeySource(settings.apiKeySource);
        setApiKeyConfigured(settings.apiKeyConfigured);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSourceChange = async (newSource: ApiKeySourceOption) => {
    setApiKeySource(newSource);
    setEditingApiKey(false);
    setApiKeyInput('');
    setApiKeyError(null);
    try {
      await window.electronAPI.updateSettings({ apiKeySource: newSource });
    } catch {
      // Best-effort — UI already updated
    }
  };

  const showSaved = () => {
    setSavedVisible(true);
    setTimeout(() => setSavedVisible(false), 1800);
  };

  const handleStartEdit = () => {
    setApiKeyInput('');
    setApiKeyError(null);
    setEditingApiKey(true);
  };

  const handleCancelEdit = () => {
    setEditingApiKey(false);
    setApiKeyInput('');
    setApiKeyError(null);
  };

  const handleSave = async () => {
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
      showSaved();
    } catch {
      setApiKeyError('An error occurred while saving. Try again.');
    } finally {
      setApiKeyValidating(false);
    }
  };

  const handleGetKey = () => {
    window.open('https://console.anthropic.com', '_blank');
  };

  if (loading) return null;

  return (
    <PageLayout
      title="Anthropic API key"
      lede="Powers the AI that navigates your portal."
    >
      <Card className="max-w-[560px] px-6 py-5 flex flex-col gap-5">
        {/* Source selector */}
        <div
          className="grid gap-2 p-1 rounded-[var(--radius-md)] border border-[var(--color-fw-border)]"
          style={{
            gridTemplateColumns: 'repeat(2, 1fr)',
            background: 'var(--color-fw-bg-deep)',
          }}
        >
          {API_KEY_SEGMENTS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleSourceChange(value)}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-[6px] text-[13px] font-medium border cursor-pointer transition-colors duration-[var(--fw-dur-fast,120ms)]',
                apiKeySource === value
                  ? 'bg-[var(--color-fw-sage-100)] border-[var(--color-fw-border-focus)] text-[var(--color-fw-ink-900)]'
                  : 'bg-transparent border-transparent text-[var(--color-fw-ink-700)] hover:text-[var(--color-fw-ink-900)] hover:bg-[var(--color-fw-card-bg)]',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Bundled key confirmation */}
        {apiKeySource === 'bundled' && (
          <p className="m-0 text-[14px] text-[var(--color-fw-fg-muted)]">
            Included — no setup required.
          </p>
        )}

        {/* Custom key form */}
        {apiKeySource === 'custom' && (
          <>
            {!editingApiKey && apiKeyConfigured && (
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14px] text-[var(--color-fw-fg)]">API key configured</span>
                  <span className="text-[13px] tracking-[0.06em] text-[var(--color-fw-fg-muted)]">
                    *****************
                  </span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  {savedVisible && (
                    <span className="text-xs font-medium text-[var(--color-fw-moss-600)]">Saved</span>
                  )}
                  <Button type="button" variant="secondary" size="sm" onClick={handleStartEdit}>
                    Change
                  </Button>
                </div>
              </div>
            )}

            {(editingApiKey || !apiKeyConfigured) && (
              <div>
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
                    Starts with sk-ant-. Get one at <strong>console.anthropic.com</strong>
                  </p>
                  {apiKeyError && (
                    <p className="mt-1 text-xs text-[var(--color-fw-crimson-600)]">{apiKeyError}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSave}
                    disabled={apiKeyValidating}
                  >
                    {apiKeyValidating ? 'Validating...' : 'Save'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleGetKey}
                  >
                    Get a key
                  </Button>
                  {apiKeyConfigured && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleCancelEdit}
                      disabled={apiKeyValidating}
                      className="ml-auto"
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </PageLayout>
  );
}

// ── (c) Storage location ──────────────────────────────────────────────────────

function StoragePage() {
  const [downloadFolder, setDownloadFolder] = useState('');
  const [savedVisible, setSavedVisible] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI
      .getSettings()
      .then((settings) => {
        setDownloadFolder(settings.downloadFolder);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const showSaved = () => {
    setSavedVisible(true);
    setTimeout(() => setSavedVisible(false), 1800);
  };

  const handleChooseFolder = async () => {
    const chosen = await window.electronAPI.chooseFolder();
    if (chosen !== null) {
      setDownloadFolder(chosen);
      await window.electronAPI.updateSettings({ downloadFolder: chosen });
      showSaved();
    }
  };

  if (loading) return null;

  return (
    <PageLayout
      title="Storage location"
      lede="Where downloaded PDFs are saved on this Mac."
    >
      <Card className="max-w-[560px] px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-fw-bg)] px-3 py-2.5">
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-mono text-[var(--color-fw-fg-muted)]">
              {downloadFolder || 'No folder selected'}
            </span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {savedVisible && (
              <span className="text-xs font-medium text-[var(--color-fw-moss-600)]">Saved</span>
            )}
            <Button type="button" variant="secondary" size="sm" onClick={handleChooseFolder}>
              Choose...
            </Button>
          </div>
        </div>
        <p className="mt-3 text-[12px] text-[var(--color-fw-fg-muted)]">
          Each portal gets its own subfolder.
        </p>
      </Card>
    </PageLayout>
  );
}

// ── (c2) Browser ──────────────────────────────────────────────────────────────

function BrowserPage() {
  const [showBrowser, setShowBrowser] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI
      .getSettings()
      .then((settings) => {
        setShowBrowser(settings.showBrowser);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleShowBrowserChange = async (checked: boolean) => {
    setShowBrowser(checked);
    try {
      await window.electronAPI.updateSettings({ showBrowser: checked });
    } catch {
      // Best-effort — UI already updated
    }
  };

  if (loading) return null;

  return (
    <PageLayout
      title="Browser"
      lede="Control how the browser behaves during record fetching."
    >
      <Card className="max-w-[560px] px-6 py-5">
        <label
          htmlFor="show-browser-toggle"
          className="flex cursor-pointer items-start gap-3"
        >
          <Checkbox
            id="show-browser-toggle"
            checked={showBrowser}
            onChange={(e) => handleShowBrowserChange(e.target.checked)}
            className="mt-0.5"
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-[14px] text-[var(--color-fw-fg)]">Show browser window</span>
            <span className="text-[12px] text-[var(--color-fw-fg-muted)]">
              Display the browser window during record fetching. Useful for debugging.
            </span>
          </div>
        </label>
      </Card>
    </PageLayout>
  );
}

// ── (d) Privacy & data ────────────────────────────────────────────────────────

function PrivacyPage() {
  return (
    <PageLayout
      title="Privacy & data"
      lede="What leaves your machine, and what stays."
    >
      <Card className="max-w-[560px] px-6 py-5">
        <p className="m-0 text-[14px] leading-[22px] text-[var(--color-fw-ink-700)]">
          Your records never leave this Mac. Navigation requests are sent to
          Anthropic's API — by default using FetchWell's key, or your own if
          you've added one. Logs are stored locally and you can wipe them at any
          time.
        </p>
      </Card>
    </PageLayout>
  );
}

// ── (e) About Fetchwell ───────────────────────────────────────────────────────

function AboutPage() {
  return (
    <PageLayout
      title="About Fetchwell"
      lede="Version, licenses, acknowledgements."
    >
      <Card className="max-w-[560px] px-6 py-5">
        <div className="flex flex-col gap-3">
          <div
            className="text-[13px] text-[var(--color-fw-ink-900)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            fetchwell 0.1.0 · build 2026.05.08
          </div>
          <div className="text-[13px] text-[var(--color-fw-fg-muted)]">
            An app that fetches your medical records, locally. Made with care.
          </div>
        </div>
      </Card>
    </PageLayout>
  );
}

// ── Root Settings component ───────────────────────────────────────────────────

export default function Settings({ onBack: _onBack, activeKey }: SettingsProps) {
  switch (activeKey) {
    case 'appearance':
      return <AppearancePage />;
    case 'key':
      return <ApiKeyPage />;
    case 'browser':
      return <BrowserPage />;
    case 'storage':
      return <StoragePage />;
    case 'privacy':
      return <PrivacyPage />;
    case 'about':
      return <AboutPage />;
    default:
      return <AppearancePage />;
  }
}
