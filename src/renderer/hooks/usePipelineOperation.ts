import { useEffect, useState } from 'react';

interface RunningOperation {
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
 * - handleExtract with PortalDetail-style error handling (surfaces pre-launch errors)
 *
 * @param onPreLaunchError - called when a pre-launch error is detected (e.g. bad API key)
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

  const startExtraction = async (portalId: string): Promise<void> => {
    if (runningOperation !== null) return;
    setRunningOperation({ portalId, operation: 'extraction' });
    try {
      await window.electronAPI.runExtraction(portalId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Pipeline errors are surfaced in ProgressPanel via IPC events.
      // Pre-launch errors (bad key, missing creds) need to be surfaced to the caller.
      if (!message.includes('Pipeline process exited')) {
        setRunningOperation(null);
        onPreLaunchError?.(message);
      }
    }
  };

  const clearTwoFa = () => {
    setTwoFa({ portalId: null, twoFactorType: undefined, deliveryHint: undefined });
  };

  const clearOperation = () => {
    setRunningOperation(null);
  };

  return {
    runningOperation,
    twoFa,
    startExtraction,
    clearTwoFa,
    clearOperation,
  };
}
