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
  // ease-out cubic bezier
  const easeOut: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65"
      role="dialog"
      aria-modal="true"
      aria-label="Two-factor authentication"
      initial={shouldReduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={shouldReduce ? undefined : { opacity: 0 }}
      transition={shouldReduce ? undefined : { duration: 0.15 }}
    >
      <motion.div
        className="w-[400px] max-w-[calc(100vw-48px)] overflow-hidden rounded-2xl bg-white shadow-[0_8px_32px_rgba(0,0,0,0.22),0_2px_8px_rgba(0,0,0,0.1)]"
        initial={shouldReduce ? false : { opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={shouldReduce ? undefined : { opacity: 0, scale: 0.97, y: 6 }}
        transition={shouldReduce ? undefined : { duration: 0.2, ease: easeOut }}
      >
        <div className="border-b border-[#f0f0f2] px-6 pb-4 pt-5">
          <h2 className="m-0 text-[17px] font-semibold text-[#1d1d1f]">Verification Required</h2>
        </div>

        <div className="px-6 pb-6 pt-5">
          {timedOut ? (
            <p className="m-0 text-[14px] leading-relaxed text-[#ff3b30]">
              Verification timed out. Please try again.
            </p>
          ) : (
            <>
              <p className="m-0 mb-5 text-[14px] leading-relaxed text-[#3d3d3f]">
                Enter the verification code sent to your email.
              </p>
              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <Label htmlFor="twofa-code-input" className="mb-1.5">
                    Verification Code
                  </Label>
                  <Input
                    id="twofa-code-input"
                    ref={inputRef}
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter code…"
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
