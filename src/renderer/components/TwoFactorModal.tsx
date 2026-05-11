import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

export interface TwoFactorModalProps {
  portalId: string;
  twoFactorType?: TwoFactorType;
  deliveryHint?: string;
  onDismiss: () => void;
}

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

type TwoFactorType = 'none' | 'email' | 'manual' | 'ui';

function getTwoFactorHint(deliveryHint?: string): string {
  if (deliveryHint) {
    return `Your portal sent a verification code via ${deliveryHint}.`;
  }
  return 'Your portal sent a verification code. Check your email or phone.';
}

export default function TwoFactorModal({ portalId, twoFactorType: twoFactorTypeProp, deliveryHint, onDismiss }: TwoFactorModalProps) {
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dismissedRef = useRef(false);

  // Auto-focus input on mount (and re-focus after verifying state clears)
  useEffect(() => {
    if (!verifying) {
      inputRef.current?.focus();
    }
  }, [verifying]);

  // Listen for 2fa:result events — keep modal open until the subprocess confirms the code
  useEffect(() => {
    const handle2FAResult = (payload: { portalId: string; success: boolean; error?: string }) => {
      if (payload.portalId !== portalId) return;

      if (payload.success) {
        // Code accepted — close the modal
        if (!dismissedRef.current) {
          dismissedRef.current = true;
          onDismiss();
        }
      } else {
        // Code rejected — re-show input with error message
        setVerifying(false);
        setCode('');
        setError(payload.error ?? 'Code not accepted — try again');
      }
    };

    window.electronAPI.on2FAResult(handle2FAResult);

    return () => {
      window.electronAPI.removeAllListeners('2fa:result');
    };
  }, [portalId, onDismiss]);

  // 5-minute timeout — fires once on mount, regardless of verifying state
  const verifyingRef = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!dismissedRef.current && !verifyingRef.current) {
        setTimedOut(true);
        window.electronAPI.submit2FACode({ portalId, code: null });
        dismissedRef.current = true;
        onDismiss();
      }
    }, TIMEOUT_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [portalId, onDismiss]);

  // Keep verifyingRef in sync
  useEffect(() => {
    verifyingRef.current = verifying;
  }, [verifying]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || verifying) return;
    setError(null);
    window.electronAPI.submit2FACode({ portalId, code: code.trim() });
    // Dismiss immediately — the pipeline continues in the background.
    // If the code is wrong, the retry flow will re-open the modal.
    if (!dismissedRef.current) {
      dismissedRef.current = true;
      onDismiss();
    }
  };

  const handleCancel = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    window.electronAPI.submit2FACode({ portalId, code: null });
    onDismiss();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const shouldReduce = useReducedMotion();
  // --fw-ease-out: cubic-bezier(0.16, 1, 0.3, 1)
  const easeOut: [number, number, number, number] = [0.16, 1, 0.3, 1];

  const hint = getTwoFactorHint(deliveryHint);

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'var(--fw-scrim)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Two-factor authentication"
      initial={shouldReduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={shouldReduce ? undefined : { opacity: 0 }}
      transition={shouldReduce ? undefined : { duration: 0.18 }}
    >
      <motion.div
        className="w-[400px] max-w-[calc(100vw-48px)] overflow-hidden rounded-[var(--radius-lg)] shadow-[var(--shadow-fw-3)]"
        style={{ background: 'var(--color-fw-modal-bg)' }}
        initial={shouldReduce ? false : { opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={shouldReduce ? undefined : { opacity: 0, scale: 0.97 }}
        transition={shouldReduce ? undefined : { duration: 0.18, ease: easeOut }}
      >
        <div className="border-b border-[var(--color-fw-border)] px-6 pb-4 pt-5">
          <h2 className="m-0 text-[17px] font-semibold text-[var(--color-fw-fg)]">Verification required</h2>
        </div>

        <div className="px-6 pb-6 pt-5">
          {timedOut ? (
            <p className="m-0 text-[14px] leading-relaxed text-[var(--color-fw-crimson-600)]">
              Verification timed out. Try again.
            </p>
          ) : (
            <>
              <p className="m-0 mb-5 text-[14px] leading-relaxed text-[var(--color-fw-fg-muted)]">
                {hint}
              </p>

              {error && (
                <p
                  role="alert"
                  className="mb-4 rounded-[var(--radius-sm)] bg-[var(--color-fw-crimson-100)] px-3 py-2 text-[13px] text-[var(--color-fw-crimson-700)]"
                >
                  {error}
                </p>
              )}

              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <Label htmlFor="twofa-code-input" className="mb-1.5">
                    Verification code
                  </Label>
                  <Input
                    id="twofa-code-input"
                    ref={inputRef}
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter code..."
                    autoComplete="one-time-code"
                    autoFocus
                    disabled={verifying}
                    className="text-base tracking-[0.1em]"
                    aria-invalid={error !== null}
                  />
                </div>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleCancel}
                    disabled={verifying}
                  >
                    Cancel
                  </Button>

                  <Button
                    type="submit"
                    disabled={!code.trim() || verifying}
                  >
                    {verifying ? (
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          style={{
                            display: 'inline-block',
                            width: 13,
                            height: 13,
                            border: '2px solid currentColor',
                            borderTopColor: 'transparent',
                            borderRadius: '50%',
                            animation: 'progress-spin 0.8s linear infinite',
                            flexShrink: 0,
                          }}
                        />
                        Verifying...
                      </span>
                    ) : (
                      'Submit'
                    )}
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
