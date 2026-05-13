import React, { useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { validatePortalUrl } from '../lib/utils';
import { strings } from '../strings';

interface AddPortalProps {
  onSave: () => void;
  onCancel: () => void;
  editPortal?: PortalEntry;
}

function suggestName(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^(www\.|mychart\.)/, '').split('.')[0];
  } catch {
    return '';
  }
}

export default function AddPortal({
  onSave,
  onCancel,
  editPortal,
}: AddPortalProps) {
  const isEdit = editPortal !== undefined;

  const [url, setUrl] = useState(editPortal?.url ?? '');
  const [name, setName] = useState(editPortal?.name ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactor, setTwoFactor] = useState<boolean>(
    editPortal ? editPortal.twoFactor !== 'none' : true,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  // Track whether name was auto-populated so we can replace it on URL change
  const nameAutoPopulated = useRef(editPortal === undefined);

  const handleUrlChange = (value: string) => {
    setUrl(value);
    if (value.trim() && !validatePortalUrl(value)) {
      setUrlError('Enter a valid URL (e.g. https://mychart.example.org).');
    } else {
      setUrlError(null);
    }
    if (nameAutoPopulated.current) {
      const suggested = suggestName(value);
      setName(suggested);
    }
  };

  const handleNameChange = (value: string) => {
    setName(value);
    nameAutoPopulated.current = false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!url.trim()) {
      setError('Portal URL is required.');
      return;
    }
    if (!validatePortalUrl(url)) {
      setUrlError('Enter a valid URL (e.g. https://mychart.example.org).');
      return;
    }
    if (!name.trim()) {
      setError('Portal name is required.');
      return;
    }

    setSubmitting(true);
    try {
      const input: PortalInput = {
        name: name.trim(),
        url: url.trim(),
        twoFactor: twoFactor ? 'ui' : 'none',
        ...(username ? { username: username.trim() } : {}),
        ...(password ? { password } : {}),
      };

      if (isEdit) {
        await window.electronAPI.updatePortal(editPortal.id, input);
      } else {
        await window.electronAPI.addPortal(input);
      }
      onSave();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col px-10 py-8">
      <div className="mb-6 flex items-center gap-4">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Back
        </Button>
        <h1 className="m-0 text-[22px] font-semibold text-[var(--color-fw-fg)]">{isEdit ? 'Edit portal' : 'Add a portal'}</h1>
      </div>

      <Card className="max-w-[560px] p-8">
        <form onSubmit={handleSubmit}>
          <div className="mb-5">
            <Label htmlFor="portal-url" className="mb-1.5">Portal URL</Label>
            <Input
              id="portal-url"
              type="text"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://mychart.example.org"
              autoComplete="off"
              spellCheck={false}
            />
            {urlError ? (
              <p className="mt-1 text-xs text-[var(--color-fw-crimson-600)]">{urlError}</p>
            ) : (
              <p className="mt-1 text-xs text-[var(--color-fw-fg-muted)]">
                The base URL of the patient portal login page.
              </p>
            )}
          </div>

          <div className="mb-5">
            <Label htmlFor="portal-name" className="mb-1.5">Portal name</Label>
            <Input
              id="portal-name"
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. UCSF Health"
              autoComplete="off"
            />
          </div>

          <div className="mb-5">
            <Label htmlFor="portal-username" className="mb-1.5">Username</Label>
            <Input
              id="portal-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your portal username or email"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="mb-5">
            <Label htmlFor="portal-password" className="mb-1.5">Password</Label>
            <Input
              id="portal-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your portal password"
              autoComplete="new-password"
            />
          </div>

          <div className="mb-5">
            <Label className="mb-1.5">Two-factor authentication</Label>
            <div className="flex gap-2">
              <button
                type="button"
                className={`rounded-[var(--radius-md)] border px-4 py-1.5 text-sm font-medium transition-colors duration-[var(--fw-dur-fast,120ms)] ${
                  twoFactor
                    ? 'border-[var(--color-fw-sage-700)] bg-[var(--color-fw-sage-100)] text-[var(--color-fw-sage-700)]'
                    : 'border-[var(--color-fw-border)] bg-transparent text-[var(--color-fw-fg-muted)] hover:bg-[var(--color-fw-bg-deep)]'
                }`}
                onClick={() => setTwoFactor(true)}
              >
                Yes
              </button>
              <button
                type="button"
                className={`rounded-[var(--radius-md)] border px-4 py-1.5 text-sm font-medium transition-colors duration-[var(--fw-dur-fast,120ms)] ${
                  !twoFactor
                    ? 'border-[var(--color-fw-sage-700)] bg-[var(--color-fw-sage-100)] text-[var(--color-fw-sage-700)]'
                    : 'border-[var(--color-fw-border)] bg-transparent text-[var(--color-fw-fg-muted)] hover:bg-[var(--color-fw-bg-deep)]'
                }`}
                onClick={() => setTwoFactor(false)}
              >
                No
              </button>
            </div>
            <p className="mt-1 text-xs text-[var(--color-fw-fg-muted)]">
              {strings.addPortal.twoFactorNote}
            </p>
          </div>

          {error && <p className="form-error mb-2 text-xs text-[var(--color-fw-crimson-600)]">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
            >
              {submitting
                ? isEdit
                  ? 'Saving...'
                  : 'Adding...'
                : isEdit
                  ? 'Save changes'
                  : 'Add portal'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
