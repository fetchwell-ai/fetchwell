import React, { useEffect, useRef, useState } from 'react';
import ErrorSummary, { resetFailureCount } from './ErrorSummary';
import { Button } from './ui/button';

export interface ProgressPanelProps {
  portalId: string;
  operation: 'discovery' | 'extraction';
  onClose: () => void;
  onReDiscover?: () => void;
}

type PanelState = 'running' | 'complete' | 'error';

interface ErrorData {
  type: string;
  category: string;
  message: string;
  suggestion: string;
}

// ── Structured progress state ───────────────────────────────────────────────

type PhaseStatus = 'pending' | 'running' | 'complete' | 'error';
type ProgressPhase = 'login' | 'navigate' | 'extract';
type ProgressCategory = 'labs' | 'visits' | 'medications' | 'messages';

interface PhaseState {
  status: PhaseStatus;
  message?: string;
}

interface CategoryState {
  status: PhaseStatus;
  count?: number;
  message?: string;
}

interface StructuredState {
  phases: Record<ProgressPhase, PhaseState>;
  categories: Partial<Record<ProgressCategory, CategoryState>>;
}

const INITIAL_STRUCTURED_STATE: StructuredState = {
  phases: {
    login: { status: 'pending' },
    navigate: { status: 'pending' },
    extract: { status: 'pending' },
  },
  categories: {},
};

// Discovery only shows login + navigate phases
const DISCOVERY_PHASES: ProgressPhase[] = ['login', 'navigate'];
const EXTRACTION_PHASES: ProgressPhase[] = ['login', 'navigate', 'extract'];
const EXTRACTION_CATEGORIES: ProgressCategory[] = ['labs', 'visits', 'medications', 'messages'];

const PHASE_LABELS: Record<ProgressPhase, string> = {
  login: 'Login',
  navigate: 'Navigate',
  extract: 'Extract',
};

const CATEGORY_LABELS: Record<ProgressCategory, string> = {
  labs: 'Labs',
  visits: 'Visits',
  medications: 'Medications',
  messages: 'Messages',
};

// ── Sub-components ──────────────────────────────────────────────────────────

function StepIndicator({
  phases,
  activePhases,
}: {
  phases: Record<ProgressPhase, PhaseState>;
  activePhases: ProgressPhase[];
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      padding: '16px 24px 12px',
      borderBottom: '1px solid #f0f0f2',
    }}>
      {activePhases.map((phase, idx) => {
        const state = phases[phase];
        const isLast = idx === activePhases.length - 1;
        return (
          <React.Fragment key={phase}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <StepIcon status={state.status} />
              <span style={{
                fontSize: 13,
                fontWeight: state.status === 'running' ? 600 : 500,
                color: state.status === 'pending' ? '#aaa' :
                       state.status === 'running' ? '#0071e3' :
                       state.status === 'complete' ? '#2e6b0a' :
                       '#c0392b',
              }}>
                {PHASE_LABELS[phase]}
              </span>
            </div>
            {!isLast && (
              <div style={{
                flex: 1,
                height: 1,
                background: state.status === 'complete' ? '#2e6b0a' : '#d2d2d7',
                margin: '0 8px',
                minWidth: 20,
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function StepIcon({ status }: { status: PhaseStatus }) {
  if (status === 'complete') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: '50%',
        background: '#2e6b0a', color: '#fff', fontSize: 11, flexShrink: 0,
      }}>&#10003;</span>
    );
  }
  if (status === 'running') {
    return <SpinnerIcon color="#0071e3" size={18} />;
  }
  if (status === 'error') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: '50%',
        background: '#c0392b', color: '#fff', fontSize: 11, flexShrink: 0,
      }}>&#10005;</span>
    );
  }
  // pending
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 18, height: 18, borderRadius: '50%',
      border: '2px solid #d2d2d7', flexShrink: 0,
    }} />
  );
}

function SpinnerIcon({ color = '#0071e3', size = 14 }: { color?: string; size?: number }) {
  return (
    <span style={{
      display: 'inline-block',
      width: size, height: size,
      border: `2px solid ${color}33`,
      borderTopColor: color,
      borderRadius: '50%',
      animation: 'progress-spin 0.8s linear infinite',
      flexShrink: 0,
    }} />
  );
}

function CategoryRow({ category, state }: { category: ProgressCategory; state: CategoryState | undefined }) {
  const status = state?.status ?? 'pending';
  const count = state?.count;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '7px 0',
    }}>
      {status === 'complete' ? (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 16, borderRadius: '50%',
          background: '#2e6b0a', color: '#fff', fontSize: 10, flexShrink: 0,
        }}>&#10003;</span>
      ) : status === 'running' ? (
        <SpinnerIcon color="#0071e3" size={16} />
      ) : status === 'error' ? (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 16, borderRadius: '50%',
          background: '#c0392b', color: '#fff', fontSize: 10, flexShrink: 0,
        }}>&#10005;</span>
      ) : (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 16, borderRadius: '50%',
          border: '1.5px solid #d2d2d7', flexShrink: 0,
        }} />
      )}
      <span style={{
        flex: 1,
        fontSize: 13,
        color: status === 'pending' ? '#aaa' : '#1d1d1f',
        fontWeight: status === 'running' ? 600 : 400,
      }}>
        {CATEGORY_LABELS[category]}
      </span>
      {status === 'complete' && count !== undefined && (
        <span style={{
          fontSize: 12,
          color: '#6e6e73',
          background: '#f5f5f7',
          borderRadius: 99,
          padding: '2px 8px',
        }}>
          {count} {count === 1 ? 'item' : 'items'}
        </span>
      )}
      {status === 'running' && (
        <span style={{ fontSize: 12, color: '#0071e3' }}>Extracting…</span>
      )}
    </div>
  );
}

function OverallProgressBar({ structured, operation }: { structured: StructuredState; operation: 'discovery' | 'extraction' }) {
  const phases = operation === 'discovery' ? DISCOVERY_PHASES : EXTRACTION_PHASES;

  // For extraction: progress is based on phase completion + category completion
  let completed = 0;
  const total = operation === 'extraction'
    ? 2 + EXTRACTION_CATEGORIES.length  // login + navigate + 4 categories
    : DISCOVERY_PHASES.length;           // login + navigate

  if (operation === 'extraction') {
    if (structured.phases.login.status === 'complete') completed++;
    if (structured.phases.navigate.status === 'complete') completed++;
    for (const cat of EXTRACTION_CATEGORIES) {
      if (structured.categories[cat]?.status === 'complete') completed++;
    }
  } else {
    for (const phase of phases) {
      if (structured.phases[phase].status === 'complete') completed++;
    }
  }

  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div style={{ padding: '8px 24px 4px' }}>
      <div style={{
        height: 4,
        borderRadius: 2,
        background: '#e8e8ed',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          borderRadius: 2,
          background: '#0071e3',
          width: `${pct}%`,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function ProgressPanel({ portalId, operation, onClose, onReDiscover }: ProgressPanelProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [panelState, setPanelState] = useState<PanelState>('running');
  const [errorData, setErrorData] = useState<ErrorData | null>(null);
  const [completedPortalId, setCompletedPortalId] = useState<string | null>(null);
  const [structured, setStructured] = useState<StructuredState>(INITIAL_STRUCTURED_STATE);
  const [showRawLog, setShowRawLog] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const title = operation === 'discovery' ? 'Running Discovery…' : 'Extracting Records…';
  const completedTitle = operation === 'discovery' ? 'Discovery Complete' : 'Extraction Complete';
  const activePhases = operation === 'discovery' ? DISCOVERY_PHASES : EXTRACTION_PHASES;

  // Auto-scroll raw log to bottom on new messages
  useEffect(() => {
    if (showRawLog) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showRawLog]);

  useEffect(() => {
    const handleProgress = (message: string) => {
      setLogs((prev) => [...prev, message]);
    };

    const handleComplete = (op: string, data: { portalId: string }) => {
      if (op === operation) {
        resetFailureCount(data.portalId);
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

    const handleStructuredProgress = (op: string, event: StructuredProgressEvent) => {
      if (op !== operation) return;

      setStructured((prev) => {
        const next = {
          phases: { ...prev.phases },
          categories: { ...prev.categories },
        };

        if (event.type === 'phase-change') {
          next.phases[event.phase] = {
            status: event.status,
            message: event.message,
          };
        } else if (event.type === 'item-progress') {
          next.categories[event.category] = {
            status: 'running',
            count: event.current,
            message: event.message,
          };
        } else if (event.type === 'category-complete') {
          next.categories[event.category] = {
            status: event.status,
            count: event.count,
          };
        }

        return next;
      });
    };

    window.electronAPI.onProgress(handleProgress);
    window.electronAPI.onComplete(handleComplete);
    window.electronAPI.onError(handleError);
    window.electronAPI.onStructuredProgress(handleStructuredProgress);

    return () => {
      window.electronAPI.removeAllListeners('extraction:log');
      window.electronAPI.removeAllListeners('discovery:log');
      window.electronAPI.removeAllListeners('extraction:complete');
      window.electronAPI.removeAllListeners('discovery:complete');
      window.electronAPI.removeAllListeners('extraction:error');
      window.electronAPI.removeAllListeners('discovery:error');
      window.electronAPI.removeAllListeners('extraction:progress');
      window.electronAPI.removeAllListeners('discovery:progress');
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

  const hasAnyStructuredEvent = Object.values(structured.phases).some(p => p.status !== 'pending') ||
    Object.keys(structured.categories).length > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45">
      <div className="progress-panel flex w-[600px] max-w-[calc(100vw-48px)] max-h-[calc(100vh-80px)] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_32px_rgba(0,0,0,0.18),0_2px_8px_rgba(0,0,0,0.08)]">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-[#f0f0f2] px-6 pb-4 pt-5">
          <h2 className="m-0 text-[17px] font-semibold text-[#1d1d1f]">
            {panelState === 'complete'
              ? completedTitle
              : panelState === 'error'
                ? 'Operation Failed'
                : title}
          </h2>
          {panelState !== 'running' && (
            <button
              type="button"
              className="cursor-pointer rounded-md border-none bg-transparent p-1 text-[14px] text-[#6e6e73] leading-none hover:bg-[#f5f5f7]"
              aria-label="Close"
              onClick={onClose}
            >
              &#x2715;
            </button>
          )}
        </div>

        {/* Structured progress body */}
        {hasAnyStructuredEvent ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Step indicator */}
            <StepIndicator phases={structured.phases} activePhases={activePhases} />

            {/* Progress bar */}
            <OverallProgressBar structured={structured} operation={operation} />

            {/* Category rows (extraction only) */}
            {operation === 'extraction' && (
              <div style={{ padding: '8px 24px 4px' }}>
                {EXTRACTION_CATEGORIES.map((cat) => (
                  <CategoryRow
                    key={cat}
                    category={cat}
                    state={structured.categories[cat]}
                  />
                ))}
              </div>
            )}

            {/* Discovery status message */}
            {operation === 'discovery' && panelState === 'running' && (
              <div style={{ padding: '12px 24px 4px' }}>
                {activePhases.map((phase) => {
                  const state = structured.phases[phase];
                  if (state.status === 'running' && state.message) {
                    return (
                      <div key={phase} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: 13, color: '#6e6e73',
                      }}>
                        <SpinnerIcon color="#0071e3" size={13} />
                        {state.message}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            )}

            {/* Raw log toggle */}
            <div style={{ padding: '8px 24px 4px' }}>
              <button
                type="button"
                onClick={() => setShowRawLog((v) => !v)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: '#6e6e73',
                  padding: '4px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span style={{
                  display: 'inline-block',
                  transform: showRawLog ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s',
                  fontSize: 10,
                }}>&#9654;</span>
                {showRawLog ? 'Hide details' : 'Show details'}
              </button>

              {showRawLog && (
                <div className="progress-panel-log mt-1.5 max-h-40 min-h-20 overflow-y-auto rounded-md bg-[#1c1c1e] px-5 py-3.5 font-mono text-xs leading-[1.7]">
                  {logs.map((line, i) => (
                    <div key={i} className="progress-log-line whitespace-pre-wrap break-words text-[#d0d0d8]">
                      {line}
                    </div>
                  ))}
                  {logs.length === 0 && (
                    <div className="progress-log-line progress-log-waiting italic text-[#6e6e73]">No output yet…</div>
                  )}
                  <div ref={logEndRef} />
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Fallback: raw log (shown while waiting for first structured event) */
          <div className="progress-panel-log flex-1 overflow-y-auto bg-[#1c1c1e] px-5 py-3.5 font-mono text-xs leading-[1.7] min-h-[220px] max-h-[400px]">
            {logs.map((line, i) => (
              <div key={i} className="progress-log-line whitespace-pre-wrap break-words text-[#d0d0d8]">
                {line}
              </div>
            ))}
            {panelState === 'running' && logs.length === 0 && (
              <div className="progress-log-line progress-log-waiting italic text-[#6e6e73]">Starting…</div>
            )}
            <div ref={logEndRef} />
          </div>
        )}

        {/* Footer */}
        {panelState === 'complete' && (
          <div className="progress-panel-footer flex-shrink-0 border-t border-[#f0f0f2] px-6 pb-5 pt-4">
            <div className="progress-complete-message rounded-lg bg-[#e3f0d8] px-3.5 py-2.5 text-[14px] text-[#2e6b0a]">
              {operation === 'discovery'
                ? 'Portal navigation mapped successfully.'
                : 'Health records extracted successfully.'}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={handleOpenInFinder}
              >
                Open in Finder
              </Button>
              <Button
                type="button"
                className="btn-primary"
                onClick={onClose}
              >
                Close
              </Button>
            </div>
          </div>
        )}

        {panelState === 'error' && errorData && (
          <div className="progress-panel-footer flex-shrink-0 border-t border-[#f0f0f2] px-6 pb-5 pt-4">
            <ErrorSummary
              portalId={portalId}
              error={errorData}
              logs={logs}
              onReDiscover={operation === 'extraction' ? onReDiscover : undefined}
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button
                type="button"
                className="btn-primary"
                onClick={onClose}
              >
                Close
              </Button>
            </div>
          </div>
        )}

        {panelState === 'running' && !hasAnyStructuredEvent && (
          <div className="progress-panel-footer flex-shrink-0 border-t border-[#f0f0f2] px-6 pb-5 pt-4">
            <div className="flex items-center gap-2.5 text-[13px] text-[#6e6e73]">
              <span className="progress-spinner inline-block h-3.5 w-3.5 flex-shrink-0 animate-[progress-spin_0.8s_linear_infinite] rounded-full border-2 border-[#d2d2d7] border-t-[#0071e3]" />
              <span>In progress…</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
