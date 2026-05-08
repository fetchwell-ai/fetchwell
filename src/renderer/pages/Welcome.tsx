import React, { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';

type Step = 'overview' | 'apiKey' | 'downloadFolder';

interface WelcomeProps {
  onComplete: () => void;
}

export default function Welcome({ onComplete }: WelcomeProps) {
  const [step, setStep] = useState<Step>('overview');

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-[520px]">
        <div className="mb-8 text-center">
          <h1 className="m-0 mb-2 text-2xl font-semibold text-[#1d1d1f]">FetchWell</h1>
          <p className="m-0 text-[13px] text-[#6e6e73]">Set up your account in a few steps</p>
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
    <Card className="p-8">
      <h2 className="m-0 mb-4 text-[18px] font-semibold">Welcome</h2>
      <div className="mb-6 rounded-lg bg-[#f5f5f7] p-4 text-[13px] leading-relaxed text-[#3d3d3f]">
        <p className="m-0 mb-3">
          FetchWell downloads your medical records from patient
          portals. It runs a browser on your computer to log in and save records
          as PDFs. <strong>Your data never leaves your machine.</strong>
        </p>
        <p className="m-0">
          The app uses an AI model (Claude) to navigate portal pages — this
          requires an Anthropic API key, which you provide. You&apos;ll be
          billed directly by Anthropic for API usage (typically a few dollars
          per extraction).
        </p>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onNext}>Get Started</Button>
      </div>
    </Card>
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
    <Card className="p-8">
      <h2 className="m-0 mb-4 text-[18px] font-semibold">Anthropic API Key</h2>
      <form onSubmit={handleSubmit}>
        <div className="mb-5">
          <Label htmlFor="api-key" className="mb-1.5">API Key</Label>
          <Input
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
          <p className="mt-1 text-xs text-[#6e6e73]">
            Starts with sk-ant-. Get one at{' '}
            <strong>console.anthropic.com</strong>
          </p>
          {error && <p className="form-error mt-1 text-xs text-[#ff3b30]">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="submit" disabled={validating}>
            {validating ? 'Validating…' : 'Continue'}
          </Button>
        </div>
      </form>
    </Card>
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
    <Card className="p-8">
      <h2 className="m-0 mb-4 text-[18px] font-semibold">Download Folder</h2>
      <p className="mb-4 text-[14px] leading-relaxed text-[#3d3d3f]">
        Records will be saved as PDFs in the folder you choose below. You can
        change this later in Settings.
      </p>
      {!loading && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-[#f5f5f7] px-3 py-2.5">
          <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-[#3d3d3f]">
            {folder || 'No folder selected'}
          </span>
          <Button type="button" variant="secondary" onClick={handleChooseFolder}>
            Choose Folder
          </Button>
        </div>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" onClick={handleFinish}>
          Finish Setup
        </Button>
      </div>
    </Card>
  );
}
