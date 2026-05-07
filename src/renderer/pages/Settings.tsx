import React, { useEffect, useState } from 'react';

interface SettingsProps {
  onBack: () => void;
}

export default function Settings({ onBack }: SettingsProps) {
  const [downloadFolder, setDownloadFolder] = useState('');
  const [showBrowser, setShowBrowser] = useState(false);
  const [incrementalExtraction, setIncrementalExtraction] = useState(true);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
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
      })
      .catch(() => {
        // ignore — defaults remain
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
      setApiKeyError('An error occurred while saving. Please try again.');
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

  if (loading) return null;

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button
          type="button"
          className="btn btn-secondary settings-back-btn"
          onClick={onBack}
        >
          ← Back
        </button>
        <h1>Settings</h1>
      </div>

      <div className="settings-container">

        {/* API Key section */}
        <div className="settings-card">
          <div className="settings-section-title">API Key</div>

          {!editingApiKey && apiKeyConfigured && (
            <div className="settings-row">
              <div className="settings-row-info">
                <span className="settings-value">API key configured</span>
                <span className="settings-masked">●●●●●●●●●●●●●●●●</span>
              </div>
              <div className="settings-row-actions">
                {savedLabel === 'api-key' && (
                  <span className="settings-saved">Saved</span>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleStartEditApiKey}
                >
                  Change
                </button>
              </div>
            </div>
          )}

          {(editingApiKey || !apiKeyConfigured) && (
            <div className="settings-api-key-edit">
              <div className="form-group">
                <label htmlFor="settings-api-key">
                  {apiKeyConfigured ? 'New API Key' : 'API Key'}
                </label>
                <input
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
                <p className="form-hint">
                  Starts with sk-ant-. Get one at{' '}
                  <strong>console.anthropic.com</strong>
                </p>
                {apiKeyError && <p className="form-error">{apiKeyError}</p>}
              </div>
              <div className="settings-edit-actions">
                {apiKeyConfigured && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCancelEditApiKey}
                    disabled={apiKeyValidating}
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveApiKey}
                  disabled={apiKeyValidating}
                >
                  {apiKeyValidating ? 'Validating…' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Download Folder section */}
        <div className="settings-card">
          <div className="settings-section-title">Download Folder</div>
          <div className="settings-row">
            <div className="folder-row settings-folder-row">
              <span className="folder-path">{downloadFolder || 'No folder selected'}</span>
            </div>
            <div className="settings-row-actions">
              {savedLabel === 'folder' && (
                <span className="settings-saved">Saved</span>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleChooseFolder}
              >
                Change
              </button>
            </div>
          </div>
          <p className="form-hint">
            Extracted PDFs will be saved to this folder.
          </p>
        </div>

        {/* Browser Visibility section */}
        <div className="settings-card">
          <div className="settings-section-title">Browser Visibility</div>
          <div className="settings-toggle-row">
            <label className="settings-toggle-label" htmlFor="show-browser">
              <input
                id="show-browser"
                type="checkbox"
                className="settings-checkbox"
                checked={showBrowser}
                onChange={handleShowBrowserToggle}
              />
              <span>Show browser window during operations</span>
            </label>
            {savedLabel === 'show-browser' && (
              <span className="settings-saved">Saved</span>
            )}
          </div>
          {showBrowser && (
            <p className="settings-warning">
              When enabled, a browser window will be visible during portal
              operations. This is useful for debugging but may be distracting
              during normal use.
            </p>
          )}
        </div>

        {/* Incremental Extraction section */}
        <div className="settings-card">
          <div className="settings-section-title">Extraction Mode</div>
          <div className="settings-toggle-row">
            <label className="settings-toggle-label" htmlFor="incremental-extraction">
              <input
                id="incremental-extraction"
                type="checkbox"
                className="settings-checkbox"
                checked={incrementalExtraction}
                onChange={handleIncrementalToggle}
              />
              <span>Incremental extraction</span>
            </label>
            {savedLabel === 'incremental' && (
              <span className="settings-saved">Saved</span>
            )}
          </div>
          <p className="form-hint">
            When enabled, only fetch records newer than the last extraction.
            Disable to re-fetch all records.
          </p>
        </div>

        {/* API costs note */}
        <div className="settings-card settings-info-card">
          <div className="settings-section-title">API Usage &amp; Costs</div>
          <p className="settings-info-text">
            API usage is billed directly by Anthropic. Typical cost: a few
            dollars per extraction run. Manage your API key at{' '}
            <strong>console.anthropic.com</strong>.
          </p>
        </div>

      </div>
    </div>
  );
}
