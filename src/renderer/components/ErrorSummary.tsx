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

function getCategoryIcon(category: string): string {
  switch (category) {
    case 'credentials':
      return '⚠️';
    case '2fa_timeout':
      return '⏱';
    case 'network':
      return '🌐';
    case 'portal_structure':
      return '🗺';
    default:
      return '❌';
  }
}

function getCategoryLabel(category: string): string {
  switch (category) {
    case 'credentials':
      return 'Credential Error';
    case '2fa_timeout':
      return 'Two-Factor Timeout';
    case 'network':
      return 'Network Error';
    case 'portal_structure':
      return 'Portal Structure Changed';
    default:
      return 'Unknown Error';
  }
}

function getCategoryColors(category: string): { border: string; bg: string } {
  switch (category) {
    case 'credentials':
      return { border: 'border-l-[#f59e0b]', bg: 'bg-[#fffbeb]' };
    case '2fa_timeout':
      return { border: 'border-l-[#3b82f6]', bg: 'bg-[#eff6ff]' };
    case 'portal_structure':
      return { border: 'border-l-[#f97316]', bg: 'bg-[#fff7ed]' };
    case 'network':
    default:
      return { border: 'border-l-[#ef4444]', bg: 'bg-[#fff1f0]' };
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
    <div className={cn('error-summary mb-1 rounded-[10px] border-l-4 p-[14px_16px]', border, bg, `error-summary--${category}`)}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex-shrink-0 text-[15px] leading-none">{getCategoryIcon(category)}</span>
        <span className="text-[13px] font-semibold text-[#1d1d1f]">{getCategoryLabel(category)}</span>
      </div>

      <p className="m-0 mb-1.5 text-[14px] leading-[1.5] text-[#1d1d1f]">{message}</p>

      {suggestion && (
        <p className="m-0 mb-1.5 text-[13px] leading-[1.5] text-[#3d3d3f]">{suggestion}</p>
      )}

      {showReDiscoverSuggestion && (
        <div className="mt-2.5 flex flex-col gap-2 border-t border-black/[0.08] pt-2.5">
          <p className="m-0 text-[13px] leading-[1.5] text-[#3d3d3f]">
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
            Copy Log
          </Button>
        </div>
      )}
    </div>
  );
}
