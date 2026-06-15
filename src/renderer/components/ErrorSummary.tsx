import React from 'react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

export interface ErrorSummaryProps {
  error: { category: string; message: string; suggestion: string };
  logs: string[];
}

function getCategoryLabel(category: string): string {
  switch (category) {
    case 'credentials':
      return 'Credential error';
    case '2fa_timeout':
      return 'Two-factor timeout';
    case 'network':
      return 'Network error';
    case 'portal_structure':
      return 'Portal structure changed';
    default:
      return 'Unexpected error';
  }
}

function getCategoryColors(category: string): { border: string; bg: string } {
  switch (category) {
    case 'credentials':
      return { border: 'border-l-[var(--color-fw-ochre-500)]', bg: 'bg-[var(--color-fw-ochre-100)]' };
    case '2fa_timeout':
      return { border: 'border-l-[var(--color-fw-sage-500)]', bg: 'bg-[var(--color-fw-sage-50)]' };
    case 'portal_structure':
      return { border: 'border-l-[var(--color-fw-ochre-600)]', bg: 'bg-[var(--color-fw-ochre-100)]' };
    case 'network':
    default:
      return { border: 'border-l-[var(--color-fw-crimson-500)]', bg: 'bg-[var(--color-fw-crimson-100)]' };
  }
}

export default function ErrorSummary({
  error,
  logs,
}: ErrorSummaryProps) {
  const { category, message, suggestion } = error;

  const handleCopyLog = async () => {
    try {
      await navigator.clipboard.writeText(logs.join('\n'));
    } catch {
      // Clipboard write failed silently
    }
  };

  const { border, bg } = getCategoryColors(category);

  return (
    <div className={cn('error-summary mb-1 rounded-[var(--radius-sm)] border-l-4 p-[14px_16px]', border, bg, `error-summary--${category}`)}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[13px] font-semibold text-[var(--color-fw-fg)]">{getCategoryLabel(category)}</span>
      </div>

      <p className="m-0 mb-1.5 text-[14px] leading-[1.5] text-[var(--color-fw-fg)]">
        {category === '2fa_timeout'
          ? 'Verification timed out — try again'
          : message}
      </p>

      {suggestion && category !== '2fa_timeout' && (
        <p className="m-0 mb-1.5 text-[13px] leading-[1.5] text-[var(--color-fw-fg-muted)]">{suggestion}</p>
      )}

      {category === 'unknown' && (
        <div className="mt-2.5 border-t border-black/[0.08] pt-2.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleCopyLog}
          >
            Copy log
          </Button>
        </div>
      )}
    </div>
  );
}
