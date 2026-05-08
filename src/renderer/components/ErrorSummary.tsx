import React from 'react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

export interface ErrorSummaryProps {
  portalId: string;
  error: { category: string; message: string; suggestion: string };
  logs: string[];
  onRetry?: () => void;
  onReDiscover?: () => void;
}

// Module-level map to track consecutive extraction failures per portal.
// Only incremented for categories that suggest re-discovery (portal_structure, unknown).
const failureCounts = new Map<string, number>();

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
      return 'Unknown error';
  }
}

function getCategoryColors(category: string): { border: string; bg: string } {
  switch (category) {
    case 'credentials':
      return { border: 'border-l-[var(--color-fw-ochre-400)]', bg: 'bg-[var(--color-fw-ochre-100)]' };
    case '2fa_timeout':
      return { border: 'border-l-[var(--color-fw-sage-500)]', bg: 'bg-[var(--color-fw-sage-50)]' };
    case 'portal_structure':
      return { border: 'border-l-[var(--color-fw-ochre-600)]', bg: 'bg-[var(--color-fw-ochre-100)]' };
    case 'network':
    default:
      return { border: 'border-l-[var(--color-fw-crimson-500)]', bg: 'bg-[var(--color-fw-crimson-100)]' };
  }
}

export function resetFailureCount(portalId: string): void {
  failureCounts.delete(portalId);
}

export default function ErrorSummary({
  portalId,
  error,
  logs,
  onReDiscover,
}: ErrorSummaryProps) {
  const { category, message, suggestion } = error;

  // Increment failure count for categories that warrant re-discovery suggestion
  // Run once on mount to increment the failure count for this error
  const portalIdRef = React.useRef(portalId);
  const categoryRef = React.useRef(category);
  React.useEffect(() => {
    if (categoryRef.current === 'portal_structure' || categoryRef.current === 'unknown') {
      const current = failureCounts.get(portalIdRef.current) ?? 0;
      failureCounts.set(portalIdRef.current, current + 1);
    }
  }, []);

  const failureCount = failureCounts.get(portalId) ?? 0;
  const showReDiscoverSuggestion = failureCount >= 2 && onReDiscover !== undefined;

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

      <p className="m-0 mb-1.5 text-[14px] leading-[1.5] text-[var(--color-fw-fg)]">{message}</p>

      {suggestion && (
        <p className="m-0 mb-1.5 text-[13px] leading-[1.5] text-[var(--color-fw-fg-muted)]">{suggestion}</p>
      )}

      {showReDiscoverSuggestion && (
        <div className="mt-2.5 flex flex-col gap-2 border-t border-black/[0.08] pt-2.5">
          <p className="m-0 text-[13px] leading-[1.5] text-[var(--color-fw-fg-muted)]">
            This portal has failed multiple times. Try re-running Map to update the portal structure.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onReDiscover}
          >
            Re-discover
          </Button>
        </div>
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
