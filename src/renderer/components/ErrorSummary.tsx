import React from 'react';

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

  return (
    <div className={`error-summary error-summary--${category}`}>
      <div className="error-summary-header">
        <span className="error-summary-icon">{getCategoryIcon(category)}</span>
        <span className="error-summary-label">{getCategoryLabel(category)}</span>
      </div>

      <p className="error-summary-message">{message}</p>

      {suggestion && (
        <p className="error-summary-suggestion">{suggestion}</p>
      )}

      {showReDiscoverSuggestion && (
        <div className="error-summary-rediscover">
          <p className="error-summary-rediscover-text">
            This portal has failed multiple times. Try re-running Map to update the portal structure.
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onReDiscover}
          >
            Re-discover
          </button>
        </div>
      )}

      {category === 'unknown' && (
        <div className="error-summary-copy-log">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleCopyLog}
          >
            Copy Log
          </button>
        </div>
      )}
    </div>
  );
}
