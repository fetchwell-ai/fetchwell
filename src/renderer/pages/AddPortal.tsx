import React, { useRef, useState } from 'react';

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
  const [loginForm, setLoginForm] = useState<'two-step' | 'single-page'>(
    editPortal?.loginForm ?? 'two-step',
  );
  const [twoFactor, setTwoFactor] = useState<
    'none' | 'email' | 'manual' | 'ui'
  >(editPortal?.twoFactor ?? 'manual');
  const [saveCredentials, setSaveCredentials] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track whether name was auto-populated so we can replace it on URL change
  const nameAutoPopulated = useRef(editPortal === undefined);

  const handleUrlChange = (value: string) => {
    setUrl(value);
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
    if (!name.trim()) {
      setError('Portal name is required.');
      return;
    }

    setSubmitting(true);
    try {
      const input: PortalInput = {
        name: name.trim(),
        url: url.trim(),
        loginForm,
        twoFactor,
        ...(saveCredentials && username ? { username: username.trim() } : {}),
        ...(saveCredentials && password ? { password } : {}),
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
    <div className="add-portal-page">
      <div className="add-portal-header">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onCancel}
        >
          ← Back
        </button>
        <h1>{isEdit ? 'Edit Portal' : 'Add Portal'}</h1>
      </div>

      <div className="add-portal-card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="portal-url">Portal URL</label>
            <input
              id="portal-url"
              type="text"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://mychart.example.org"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="form-hint">
              The base URL of the patient portal login page.
            </p>
          </div>

          <div className="form-group">
            <label htmlFor="portal-name">Portal Name</label>
            <input
              id="portal-name"
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. UCSF Health"
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label htmlFor="portal-username">Username (optional)</label>
            <input
              id="portal-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your portal username or email"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="form-group">
            <label htmlFor="portal-password">Password (optional)</label>
            <input
              id="portal-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your portal password"
              autoComplete="new-password"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="portal-login-type">Login Type</label>
              <select
                id="portal-login-type"
                className="form-select"
                value={loginForm}
                onChange={(e) =>
                  setLoginForm(e.target.value as 'two-step' | 'single-page')
                }
              >
                <option value="two-step">Two-step (default)</option>
                <option value="single-page">Single page</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="portal-2fa">2FA Method</label>
              <select
                id="portal-2fa"
                className="form-select"
                value={twoFactor}
                onChange={(e) =>
                  setTwoFactor(
                    e.target.value as 'none' | 'email' | 'manual' | 'ui',
                  )
                }
              >
                <option value="manual">Manual (default)</option>
                <option value="email">Email</option>
                <option value="ui">UI</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>

          <div className="form-group form-checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={saveCredentials}
                onChange={(e) => setSaveCredentials(e.target.checked)}
              />
              <span>Save credentials (stored securely on this device)</span>
            </label>
            {!saveCredentials && (
              <p className="form-hint">
                Credentials will be prompted each time extraction runs.
              </p>
            )}
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting
                ? isEdit
                  ? 'Saving…'
                  : 'Adding…'
                : isEdit
                  ? 'Save Changes'
                  : 'Add Portal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
