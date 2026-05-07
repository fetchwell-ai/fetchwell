import React, { useEffect, useRef, useState } from 'react';

export interface TwoFactorModalProps {
  portalId: string;
  onDismiss: () => void;
}

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export default function TwoFactorModal({ portalId, onDismiss }: TwoFactorModalProps) {
  const [code, setCode] = useState('');
  const [timedOut, setTimedOut] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 5-minute timeout
  useEffect(() => {
    const timer = setTimeout(() => {
      setTimedOut(true);
      window.electronAPI.submit2FACode({ portalId, code: null });
      onDismiss();
    }, TIMEOUT_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [portalId, onDismiss]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    window.electronAPI.submit2FACode({ portalId, code: code.trim() });
    onDismiss();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="twofa-overlay" role="dialog" aria-modal="true" aria-label="Two-factor authentication">
      <div className="twofa-modal">
        <div className="twofa-modal-header">
          <h2 className="twofa-modal-title">Verification Required</h2>
        </div>

        <div className="twofa-modal-body">
          {timedOut ? (
            <p className="twofa-timeout-message">
              Verification timed out. Please try again.
            </p>
          ) : (
            <>
              <p className="twofa-message">
                Enter the verification code sent to your email.
              </p>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="twofa-code-input" className="twofa-input-label">
                    Verification Code
                  </label>
                  <input
                    id="twofa-code-input"
                    ref={inputRef}
                    type="text"
                    className="twofa-input"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter code…"
                    autoComplete="one-time-code"
                    autoFocus
                  />
                </div>

                <div className="twofa-modal-actions">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={!code.trim()}
                  >
                    Submit
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
