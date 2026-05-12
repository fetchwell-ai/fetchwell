import React, { useEffect, useState } from 'react';
import { Monitor, Sun, Moon } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { Checkbox } from '../components/ui/checkbox';
import { cn } from '../lib/utils';
import { strings } from '../strings';

interface SettingsProps {
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

const s_appearance = strings.settings.appearance;

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
    { value: 'system', label: s_appearance.system, Icon: Monitor },
    { value: 'light',  label: s_appearance.light,  Icon: Sun },
    { value: 'dark',   label: s_appearance.dark,   Icon: Moon },
  ];

  return (
    <PageLayout title={s_appearance.title} lede={s_appearance.lede}>
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
          {s_appearance.hint}
        </p>
      </Card>
    </PageLayout>
  );
}

// ── (b) Anthropic API key ─────────────────────────────────────────────────────


const s_apiKey = strings.settings.apiKey;

const API_KEY_SEGMENTS: { value: ApiKeySource; label: string }[] = [
  { value: 'bundled', label: s_apiKey.sourceBundled },
  { value: 'custom',  label: s_apiKey.sourceCustom },
];

function ApiKeyPage() {
  const [apiKeySource, setApiKeySource] = useState<ApiKeySource>('bundled');
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

  const handleSourceChange = async (newSource: ApiKeySource) => {
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
      setApiKeyError(s_apiKey.errorRequired);
      return;
    }
    setApiKeyError(null);
    setApiKeyValidating(true);
    try {
      const valid = await window.electronAPI.validateApiKey(trimmed);
      if (!valid) {
        setApiKeyError(s_apiKey.errorInvalid);
        return;
      }
      await window.electronAPI.updateSettings({ apiKey: trimmed });
      setApiKeyConfigured(true);
      setEditingApiKey(false);
      setApiKeyInput('');
      showSaved();
    } catch {
      setApiKeyError(s_apiKey.errorSaving);
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
      title={s_apiKey.title}
      lede={s_apiKey.lede}
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
            {s_apiKey.bundledConfirmation}
          </p>
        )}

        {/* Custom key form */}
        {apiKeySource === 'custom' && (
          <>
            {!editingApiKey && apiKeyConfigured && (
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14px] text-[var(--color-fw-fg)]">{s_apiKey.configured}</span>
                  <span className="text-[13px] tracking-[0.06em] text-[var(--color-fw-fg-muted)]">
                    {s_apiKey.mask}
                  </span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  {savedVisible && (
                    <span className="text-xs font-medium text-[var(--color-fw-moss-600)]">{s_apiKey.buttonSaved}</span>
                  )}
                  <Button type="button" variant="secondary" size="sm" onClick={handleStartEdit}>
                    {s_apiKey.buttonChange}
                  </Button>
                </div>
              </div>
            )}

            {(editingApiKey || !apiKeyConfigured) && (
              <div>
                <div className="mb-5">
                  <Label htmlFor="settings-api-key" className="mb-1.5">
                    {apiKeyConfigured ? s_apiKey.labelNew : s_apiKey.labelDefault}
                  </Label>
                  <Input
                    id="settings-api-key"
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => {
                      setApiKeyInput(e.target.value);
                      setApiKeyError(null);
                    }}
                    placeholder={s_apiKey.placeholder}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p className="mt-1 text-xs text-[var(--color-fw-fg-muted)]">
                    {s_apiKey.hint} <strong>{s_apiKey.hintDomain}</strong>
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
                    {apiKeyValidating ? s_apiKey.buttonValidating : s_apiKey.buttonSave}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleGetKey}
                  >
                    {s_apiKey.buttonGetKey}
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
                      {s_apiKey.buttonCancel}
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

const s_storage = strings.settings.storage;

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
      title={s_storage.title}
      lede={s_storage.lede}
    >
      <Card className="max-w-[560px] px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-fw-bg)] px-3 py-2.5">
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-mono text-[var(--color-fw-fg-muted)]">
              {downloadFolder || s_storage.noFolder}
            </span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {savedVisible && (
              <span className="text-xs font-medium text-[var(--color-fw-moss-600)]">{s_storage.saved}</span>
            )}
            <Button type="button" variant="secondary" size="sm" onClick={handleChooseFolder}>
              {s_storage.buttonChoose}
            </Button>
          </div>
        </div>
        <p className="mt-3 text-[12px] text-[var(--color-fw-fg-muted)]">
          {s_storage.hint}
        </p>
      </Card>
    </PageLayout>
  );
}

// ── (c2) Browser ──────────────────────────────────────────────────────────────

const s_browser = strings.settings.browser;

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
      title={s_browser.title}
      lede={s_browser.lede}
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
            <span className="text-[14px] text-[var(--color-fw-fg)]">{s_browser.showBrowserLabel}</span>
            <span className="text-[12px] text-[var(--color-fw-fg-muted)]">
              {s_browser.showBrowserDescription}
            </span>
          </div>
        </label>
      </Card>
    </PageLayout>
  );
}

// ── (d) Privacy & data ────────────────────────────────────────────────────────

const s_privacy = strings.settings.privacy;

function PrivacyPage() {
  return (
    <PageLayout
      title={s_privacy.title}
      lede={s_privacy.lede}
    >
      <Card className="max-w-[560px] px-6 py-5">
        <p className="m-0 text-[14px] leading-[22px] text-[var(--color-fw-ink-700)]">
          {s_privacy.body}
        </p>
      </Card>
    </PageLayout>
  );
}

// ── (e) About Fetchwell ───────────────────────────────────────────────────────

const s_about = strings.settings.about;

function AboutPage() {
  return (
    <PageLayout
      title={s_about.title}
      lede={s_about.lede}
    >
      <Card className="max-w-[560px] px-6 py-5">
        <div className="flex flex-col gap-3">
          <div
            className="text-[13px] text-[var(--color-fw-ink-900)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {strings.brand.buildVersion}
          </div>
          <div className="text-[13px] text-[var(--color-fw-fg-muted)]">
            {strings.brand.tagline}
          </div>
        </div>
      </Card>
    </PageLayout>
  );
}

// ── Root Settings component ───────────────────────────────────────────────────

export default function Settings({ activeKey }: SettingsProps) {
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
