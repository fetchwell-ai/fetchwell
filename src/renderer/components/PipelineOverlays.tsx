import React from 'react';
import { AnimatePresence } from 'framer-motion';
import ProgressPanel, { type PortalCounts } from './ProgressPanel';
import TwoFactorModal from './TwoFactorModal';

export interface PipelineOverlaysProps {
  /** The currently running operation, or null if idle. */
  runningOperation: { portalId: string; operation: 'extraction' } | null;
  /** 2FA modal state. */
  twoFa: {
    portalId: string | null;
    twoFactorType: string | undefined;
    deliveryHint: string | undefined;
  };
  /** Called when the ProgressPanel close button is clicked. */
  onProgressClose: () => void;
  /** Called when the 2FA modal is dismissed. */
  onTwoFaDismiss: () => void;
  /** Optional portal counts to display inside ProgressPanel. */
  portalCounts?: PortalCounts;
}

/**
 * Renders the ProgressPanel and TwoFactorModal overlays for the pipeline
 * operation lifecycle. Both PortalList and PortalDetail share this component.
 */
export default function PipelineOverlays({
  runningOperation,
  twoFa,
  onProgressClose,
  onTwoFaDismiss,
  portalCounts,
}: PipelineOverlaysProps) {
  return (
    <>
      <AnimatePresence>
        {runningOperation !== null && (
          <ProgressPanel
            key="progress-panel"
            portalId={runningOperation.portalId}
            operation={runningOperation.operation}
            onClose={onProgressClose}
            portalCounts={portalCounts}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {twoFa.portalId !== null && (
          <TwoFactorModal
            key="2fa-modal"
            portalId={twoFa.portalId}
            twoFactorType={twoFa.twoFactorType as 'none' | 'email' | 'manual' | 'ui' | undefined}
            deliveryHint={twoFa.deliveryHint}
            onDismiss={onTwoFaDismiss}
          />
        )}
      </AnimatePresence>
    </>
  );
}
