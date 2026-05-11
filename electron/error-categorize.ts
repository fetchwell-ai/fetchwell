/**
 * Error categorization for pipeline errors.
 * Extracted from pipeline-bridge.ts so it can be unit-tested without importing Electron.
 */

export function categorizeError(message: string): { category: string; suggestion: string } {
  const lower = message.toLowerCase();

  if (lower.includes('credentials') || lower.includes('login failed')) {
    return {
      category: 'credentials',
      suggestion: 'Check your username and password in portal settings',
    };
  }

  if (lower.includes('2fa') || lower.includes('timed out') || lower.includes('cancelled') || lower.includes('canceled')) {
    return {
      category: '2fa_timeout',
      suggestion: 'Verification timed out — try again',
    };
  }

  if (lower.includes('enotfound') || lower.includes('econnrefused')) {
    return {
      category: 'network',
      suggestion: 'Check your internet connection',
    };
  }

  if (lower.includes('nav-map') || lower.includes('not found')) {
    return {
      category: 'portal_structure',
      suggestion: "The portal may have changed — try re-running Map",
    };
  }

  return {
    category: 'unknown',
    suggestion: 'An unexpected error occurred. Copy the log for troubleshooting.',
  };
}
