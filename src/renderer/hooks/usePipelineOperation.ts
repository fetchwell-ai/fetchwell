import { useCallback, useEffect, useRef, useState } from 'react';

export interface RunningOperation {
  portalId: string;
  operation: 'extraction';
}

interface TwoFaState {
  portalId: string | null;
  twoFactorType: string | undefined;
  deliveryHint: string | undefined;
}

export interface PipelineOperationState {
  runningOperation: RunningOperation | null;
  twoFa: TwoFaState;
  startExtraction: (portalId: string) => Promise<void>;
  clearTwoFa: () => void;
  clearOperation: () => void;
}

/**
 * Manages the lifecycle of a pipeline operation (extraction) including:
 * - running operation state
 * - 2FA IPC listener (active only while an operation is in progress)
 * - startExtraction with PortalDetail-style error handling (surfaces pre-launch errors)
 *
 * @param onPreLaunchError - called when a pre-launch error is detected (e.g. bad API key).
 *   Captured via a ref so callers can pass an inline arrow without causing
 *   startExtraction to be recreated on every render.
 */
export function usePipelineOperation(
  onPreLaunchError?: (message: string) => void,
): PipelineOperationState {
  const [runningOperation, setRunningOperation] = useState<RunningOperation | null>(null);
  const [twoFa, setTwoFa] = useState<TwoFaState>({
    portalId: null,
    twoFactorType: undefined,
    deliveryHint: undefined,
  });

  // Stable ref so startExtraction can call the latest callback without being
  // recreated every time the caller's inline arrow changes identity.
  const onErrorRef = useRef(onPreLaunchError);
  useEffect(() => {
    onErrorRef.current = onPreLaunchError;
  }, [onPreLaunchError]);

  // Ref-backed guard so startExtraction can stay stable (empty deps) while
  // still correctly preventing concurrent launches. Updated in sync with the state.
  const isRunningRef = useRef(false);

  // 2FA listener — active only while an operation is running
  useEffect(() => {
    if (runningOperation === null) return;

    const handle2FARequest = (payload: {
      portalId: string;
      twoFactorType?: string;
      deliveryHint?: string;
    }) => {
      setTwoFa({
        portalId: payload.portalId,
        twoFactorType: payload.twoFactorType,
        deliveryHint: payload.deliveryHint,
      });
    };

    const unsubRequest = window.electronAPI.on2FARequest(handle2FARequest);

    return () => {
      unsubRequest();
    };
  }, [runningOperation]);

  const startExtraction = useCallback(async (portalId: string): Promise<void> => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    setRunningOperation({ portalId, operation: 'extraction' });
    try {
      await window.electronAPI.runExtraction(portalId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Pipeline errors are surfaced in ProgressPanel via IPC events.
      // Pre-launch errors (bad key, missing creds) need to be surfaced to the caller.
      if (!message.includes('Pipeline process exited')) {
        isRunningRef.current = false;
        setRunningOperation(null);
        onErrorRef.current?.(message);
      }
    }
  }, []); // stable — all mutable values accessed via refs

  const clearTwoFa = useCallback(() => {
    setTwoFa({ portalId: null, twoFactorType: undefined, deliveryHint: undefined });
  }, []);

  const clearOperation = useCallback(() => {
    isRunningRef.current = false;
    setRunningOperation(null);
  }, []);

  return {
    runningOperation,
    twoFa,
    startExtraction,
    clearTwoFa,
    clearOperation,
  };
}
