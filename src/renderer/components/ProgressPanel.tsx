import React, { useEffect, useRef, useState } from 'react';

export interface ProgressPanelProps {
  portalId: string;
  operation: 'discovery' | 'extraction';
  onClose: () => void;
}

type PanelState = 'running' | 'complete' | 'error';

interface ErrorData {
  type: string;
  category: string;
  message: string;
  suggestion: string;
}

export default function ProgressPanel({ portalId, operation, onClose }: ProgressPanelProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [panelState, setPanelState] = useState<PanelState>('running');
  const [errorData, setErrorData] = useState<ErrorData | null>(null);
  const [completedPortalId, setCompletedPortalId] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const title = operation === 'discovery' ? 'Running Discovery...' : 'Extracting Records...';
  const completedTitle = operation === 'discovery' ? 'Discovery Complete' : 'Extraction Complete';

  // Auto-scroll to bottom on new log messages
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    const handleProgress = (message: string) => {
      setLogs((prev) => [...prev, message]);
    };

    const handleComplete = (op: string, data: { portalId: string }) => {
      if (op === operation) {
        setCompletedPortalId(data.portalId);
        setPanelState('complete');
      }
    };

    const handleError = (
      op: string,
      data: { type: string; category: string; message: string; suggestion: string },
    ) => {
      if (op === operation) {
        setErrorData(data);
        setPanelState('error');
      }
    };

    window.electronAPI.onProgress(handleProgress);
    window.electronAPI.onComplete(handleComplete);
    window.electronAPI.onError(handleError);

    return () => {
      const logChannel = operation === 'extraction' ? 'extraction:log' : 'discovery:log';
      const completeChannel = operation === 'extraction' ? 'extraction:complete' : 'discovery:complete';
      const errorChannel = operation === 'extraction' ? 'extraction:error' : 'discovery:error';
      window.electronAPI.removeAllListeners(logChannel);
      window.electronAPI.removeAllListeners(completeChannel);
      window.electronAPI.removeAllListeners(errorChannel);
    };
  }, [operation]);

  const handleOpenInFinder = async () => {
    try {
      const settings = await window.electronAPI.getSettings();
      const folder = `${settings.downloadFolder}/${completedPortalId ?? portalId}`;
      await window.electronAPI.openInFinder(folder);
    } catch {
      // Silently ignore — the folder may not exist yet
    }
  };

  return (
    <div className="progress-panel-overlay">
      <div className="progress-panel">
        <div className="progress-panel-header">
          <h2 className="progress-panel-title">
            {panelState === 'complete'
              ? completedTitle
              : panelState === 'error'
                ? 'Operation Failed'
                : title}
          </h2>
          {panelState !== 'running' && (
            <button
              type="button"
              className="btn-icon progress-panel-close-icon"
              aria-label="Close"
              onClick={onClose}
            >
              &#x2715;
            </button>
          )}
        </div>

        <div className="progress-panel-log">
          {logs.map((line, i) => (
            <div key={i} className="progress-log-line">
              {line}
            </div>
          ))}
          {panelState === 'running' && logs.length === 0 && (
            <div className="progress-log-line progress-log-waiting">Starting…</div>
          )}
          <div ref={logEndRef} />
        </div>

        {panelState === 'complete' && (
          <div className="progress-panel-footer">
            <div className="progress-complete-message">
              {operation === 'discovery'
                ? 'Portal navigation mapped successfully.'
                : 'Health records extracted successfully.'}
            </div>
            <div className="progress-panel-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleOpenInFinder}
              >
                Open in Finder
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {panelState === 'error' && errorData && (
          <div className="progress-panel-footer">
            <div className="progress-error-message">
              <strong>Error:</strong> {errorData.message}
            </div>
            {errorData.suggestion && (
              <div className="progress-error-suggestion">{errorData.suggestion}</div>
            )}
            <div className="progress-panel-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {panelState === 'running' && (
          <div className="progress-panel-footer">
            <div className="progress-running-indicator">
              <span className="progress-spinner" />
              <span className="progress-running-text">In progress…</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
