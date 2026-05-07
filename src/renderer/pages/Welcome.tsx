import React, { useEffect, useState } from 'react';

type Step = 'overview' | 'apiKey' | 'downloadFolder';

interface WelcomeProps {
  onComplete: () => void;
}

export default function Welcome({ onComplete }: WelcomeProps) {
  const [step, setStep] = useState<Step>('overview');

  return (
    <div className="page">
      <div className="wizard-container">
        <div className="wizard-header">
          <h1>FetchWell</h1>
          <p>Set up your account in a few steps</p>
        </div>
        {step === 'overview' && (
          <OverviewStep onNext={() => setStep('apiKey')} />
        )}
        {step === 'apiKey' && (
          <ApiKeyStep onNext={() => setStep('downloadFolder')} />
        )}
        {step === 'downloadFolder' && (
          <DownloadFolderStep onFinish={onComplete} />
        )}
      </div>
    </div>
  );
}

// --- Step 1: Overview ---

interface OverviewStepProps {
  onNext: () => void;
}

function OverviewStep({ onNext }: OverviewStepProps) {
  return (
    <div className="wizard-card">
      <h2>Welcome</h2>
      <div className="privacy-disclosure">
        <p>
          FetchWell downloads your medical records from patient
          portals. It runs a browser on your computer to log in and save records
          as PDFs. <strong>Your data never leaves your machine.</strong>
        </p>
        <p>
          The app uses an AI model (Claude) to navigate portal pages — this
          requires an Anthropic API key, which you provide. You&apos;ll be
          billed directly by Anthropic for API usage (typically a few dollars
          per extraction).
        </p>
      </div>
      <div className="wizard-actions">
        <button className="btn btn-primary" onClick={onNext}>
          Get Started
        </button>
      </div>
    </div>
  );
}

// --- Step 2: API Key ---

interface ApiKeyStepProps {
  onNext: () => void;
}

function ApiKeyStep({ onNext }: ApiKeyStepProps) {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      setError('API key is required');
      return;
    }
    setError(null);
    setValidating(true);
    try {
      const valid = await window.electronAPI.validateApiKey(key.trim());
      if (!valid) {
        setError('Invalid API key format. Make sure it starts with sk-ant-');
        return;
      }
      await window.electronAPI.updateSettings({ apiKey: key.trim() });
      onNext();
    } catch {
      setError('An error occurred while saving the API key. Please try again.');
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="wizard-card">
      <h2>Anthropic API Key</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="api-key">API Key</label>
          <input
            id="api-key"
            type="password"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setError(null);
            }}
            placeholder="sk-ant-..."
            autoComplete="off"
            spellCheck={false}
          />
          <p className="form-hint">
            Starts with sk-ant-. Get one at{' '}
            <strong>console.anthropic.com</strong>
          </p>
          {error && <p className="form-error">{error}</p>}
        </div>
        <div className="wizard-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={validating}
          >
            {validating ? 'Validating…' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  );
}

// --- Step 3: Download Folder ---

interface DownloadFolderStepProps {
  onFinish: () => void;
}

function DownloadFolderStep({ onFinish }: DownloadFolderStepProps) {
  const [folder, setFolder] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI
      .getSettings()
      .then((settings) => {
        setFolder(settings.downloadFolder);
      })
      .catch(() => {
        setFolder('');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleChooseFolder = async () => {
    const chosen = await window.electronAPI.chooseFolder();
    if (chosen !== null) {
      setFolder(chosen);
      await window.electronAPI.updateSettings({ downloadFolder: chosen });
    }
  };

  const handleFinish = async () => {
    onFinish();
  };

  return (
    <div className="wizard-card">
      <h2>Download Folder</h2>
      <p>
        Records will be saved as PDFs in the folder you choose below. You can
        change this later in Settings.
      </p>
      {!loading && (
        <div className="folder-row">
          <span className="folder-path">{folder || 'No folder selected'}</span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleChooseFolder}
          >
            Choose Folder
          </button>
        </div>
      )}
      <div className="wizard-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleFinish}
        >
          Finish Setup
        </button>
      </div>
    </div>
  );
}
