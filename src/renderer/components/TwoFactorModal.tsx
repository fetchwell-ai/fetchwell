import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

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

  const shouldReduce = useReducedMotion();
  // --fw-ease-out: cubic-bezier(0.16, 1, 0.3, 1)
  const easeOut: [number, number, number, number] = [0.16, 1, 0.3, 1];

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
        style={{ background: 'var(--fw-modal-bg)' }}
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
                Enter the code your portal just sent.
              </p>
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
                    className="text-base tracking-[0.1em]"
                  />
                </div>

                <div className="mt-4 flex justify-end">
                  <Button
                    type="submit"
                    disabled={!code.trim()}
                  >
                    Submit
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
