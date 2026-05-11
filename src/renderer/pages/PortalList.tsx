import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Clock,
  Download,
  FileText,
  Folder,
  MessageSquare,
  Pill,
  Settings,
} from 'lucide-react';
import AddPortal from './AddPortal';
import ProgressPanel from '../components/ProgressPanel';
import TwoFactorModal from '../components/TwoFactorModal';
import QuickStart, { deriveQuickStartSteps } from '../components/QuickStart';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { cn } from '../lib/utils';

interface PortalListProps {
  onOpenSettings: () => void;
  onNavigateToApiKey: () => void;
  selectedPortalId?: string | null;
  onPortalsChanged?: () => void;
  initialView?: 'list' | 'add';
}

type View =
  | { type: 'list' }
  | { type: 'add' }
  | { type: 'edit'; portal: PortalEntry };

interface RunningOperation {
  portalId: string;
  operation: 'extraction';
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// -- Skeleton for the portal list loading state --

function SkeletonBar({
  width,
  height,
  rounded = 'rounded-md',
}: {
  width: number | string;
  height: number;
  rounded?: string;
}) {
  return (
    <div
      className={`bg-[var(--color-fw-bg-deep)] animate-pulse ${rounded}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height,
        animationDuration: '1.4s',
        animationTimingFunction: 'ease-in-out',
      }}
    />
  );
}

function PortalCardSkeleton() {
  return (
    <div className="bg-[var(--color-fw-card-bg)] rounded-[var(--radius-md)] border border-[var(--color-fw-border)] px-6 py-5 shadow-[var(--shadow-fw-1)]">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex flex-col gap-1.5">
          <SkeletonBar width={160} height={14} />
          <SkeletonBar width={240} height={11} />
        </div>
        <SkeletonBar width={26} height={26} rounded="rounded-md" />
      </div>
      <div className="mb-4 flex gap-2">
        <SkeletonBar width={100} height={20} rounded="rounded-full" />
      </div>
      <div className="flex gap-2">
        <SkeletonBar width={60} height={30} rounded="rounded-[var(--radius-md)]" />
        <SkeletonBar width={72} height={30} rounded="rounded-[var(--radius-md)]" />
        <SkeletonBar width={68} height={30} rounded="rounded-[var(--radius-md)]" />
      </div>
    </div>
  );
}

function PortalListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <PortalCardSkeleton />
      <PortalCardSkeleton />
    </div>
  );
}

// -- PortalCard v2 helpers --

type PortalState = 'ready' | 'fetched' | 'error';

function derivePortalState(portal: PortalEntry): PortalState {
  // 'error' state reserved for future use — requires a lastError field on PortalEntry
  // and corresponding IPC wiring. The error UI (badge, guidance, button) is implemented
  // and ready to activate once the type is extended.
  if (portal.lastExtractedAt !== null) return 'fetched';
  return 'ready';
}

// Pill badge with status dot
interface PortalBadgeProps {
  variant: 'default' | 'info' | 'success' | 'danger';
  children: React.ReactNode;
}

function PortalBadge({ variant, children }: PortalBadgeProps) {
  const styles: Record<PortalBadgeProps['variant'], { badge: string; dot: string }> = {
    default: {
      badge: 'bg-[var(--color-fw-bg-deep)] text-[var(--color-fw-ink-700)]',
      dot: 'bg-[var(--color-fw-ink-400)]',
    },
    info: {
      badge: 'bg-[var(--color-fw-sage-100)] text-[var(--color-fw-sage-700)]',
      dot: 'bg-[var(--color-fw-sage-700)]',
    },
    success: {
      badge: 'bg-[var(--color-fw-moss-100)] text-[var(--color-fw-moss-700)]',
      dot: 'bg-[var(--color-fw-moss-600)]',
    },
    danger: {
      badge: 'bg-[var(--color-fw-crimson-100)] text-[var(--color-fw-crimson-700)]',
      dot: 'bg-[var(--color-fw-crimson-600)]',
    },
  };

  const s = styles[variant];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-[22px] px-[10px] rounded-full text-xs font-medium',
        s.badge,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', s.dot)} />
      {children}
    </span>
  );
}

// Guidance strip
interface GuidanceStripProps {
  variant: 'info' | 'success' | 'error';
  icon: React.ReactNode;
  heading: string;
  body: string;
}

function GuidanceStrip({ variant, icon, heading, body }: GuidanceStripProps) {
  const styles: Record<GuidanceStripProps['variant'], string> = {
    info: 'bg-[var(--color-fw-sage-100)] text-[var(--color-fw-sage-700)] border-l-[var(--color-fw-sage-700)]',
    success: 'bg-[var(--color-fw-moss-100)] text-[var(--color-fw-moss-700)] border-l-[var(--color-fw-moss-600)]',
    error: 'bg-[var(--color-fw-crimson-100)] text-[var(--color-fw-crimson-700)] border-l-[var(--color-fw-crimson-600)]',
  };

  return (
    <div
      className={cn(
        'flex gap-2.5 px-3.5 py-3 border-l-[3px] rounded-[6px] text-[13px] leading-[19px] items-start',
        styles[variant],
      )}
    >
      <span className="flex-shrink-0 mt-px">{icon}</span>
      <div className="flex-1">
        <p className="m-0 font-semibold">{heading}</p>
        <span className="block mt-1 opacity-85">{body}</span>
      </div>
    </div>
  );
}

// Meta strip (fetched state)
interface MetaStripProps {
  portal: PortalEntry;
  downloadFolder: string;
}

function MetaStrip({ portal, downloadFolder }: MetaStripProps) {
  const folderPath = `${downloadFolder}/${portal.id}`;
  return (
    <div className="flex flex-wrap gap-4 text-xs text-[var(--color-fw-fg-muted)] pt-1 border-t border-dashed border-[var(--color-fw-border)]">
      <div className="flex items-center gap-1.5">
        <FileText size={14} className="text-[var(--color-fw-fg-subtle)] flex-shrink-0" />
        <span>
          Mapped:{' '}
          <span className="text-[var(--color-fw-ink-700)] font-medium">
            {formatDate(portal.discoveredAt)}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Clock size={14} className="text-[var(--color-fw-fg-subtle)] flex-shrink-0" />
        <span>
          Last fetched:{' '}
          <span className="text-[var(--color-fw-ink-700)] font-medium">
            {formatDate(portal.lastExtractedAt)}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Folder size={14} className="text-[var(--color-fw-fg-subtle)] flex-shrink-0" />
        <span className="font-mono text-[11px]">{folderPath}</span>
      </div>
    </div>
  );
}

// Compact inline record count badges (fetched state only)

interface RecordCountBadgesProps {
  portal: PortalEntry;
}

function RecordCountBadges({ portal }: RecordCountBadgesProps) {
  const items: Array<{ icon: React.ReactNode; count: number; label: string }> = [
    { icon: <Activity size={11} />, count: portal.labCount ?? 0, label: 'labs' },
    { icon: <FileText size={11} />, count: portal.visitCount ?? 0, label: 'visits' },
    { icon: <Pill size={11} />, count: portal.medicationCount ?? 0, label: 'meds' },
    { icon: <MessageSquare size={11} />, count: portal.messageCount ?? 0, label: 'messages' },
  ].filter((item) => item.count > 0);

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item.label}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--color-fw-bg-deep)] text-[var(--color-fw-ink-700)]"
        >
          <span className="text-[var(--color-fw-fg-subtle)]">{item.icon}</span>
          {item.count} {item.label}
        </span>
      ))}
    </div>
  );
}

// -- PortalCard --

interface PortalCardProps {
  portal: PortalEntry;
  onEdit: (portal: PortalEntry) => void;
  onRemove: (portal: PortalEntry) => void;
  onExtract: (portalId: string) => void;
  runningOperation: RunningOperation | null;
  isSelected?: boolean;
  downloadFolder: string;
}

function PortalCard({ portal, onEdit, onRemove, onExtract, runningOperation, isSelected, downloadFolder }: PortalCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isSelected && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isSelected]);

  const isThisRunning =
    runningOperation !== null && runningOperation.portalId === portal.id;
  const isAnotherRunning =
    runningOperation !== null && runningOperation.portalId !== portal.id;

  const handleExtract = (e: React.MouseEvent) => {
    e.stopPropagation();
    onExtract(portal.id);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = window.confirm(
      `Remove "${portal.name}"? This cannot be undone.`,
    );
    if (confirmed) {
      onRemove(portal);
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(portal);
  };

  const portalState = derivePortalState(portal);
  const anyOperationRunning = runningOperation !== null;
  const extractDisabled = anyOperationRunning;

  const extractTitle = isAnotherRunning
    ? 'Another operation is in progress'
    : isThisRunning && runningOperation?.operation === 'extraction'
      ? 'Extraction running...'
      : undefined;

  // Badge per state
  let badge: React.ReactNode;
  if (portalState === 'ready') {
    badge = <PortalBadge variant="info">Ready to fetch</PortalBadge>;
  } else if (portalState === 'fetched') {
    badge = (
      <PortalBadge variant="success">
        Last fetched {formatDate(portal.lastExtractedAt)}
      </PortalBadge>
    );
  } else {
    badge = <PortalBadge variant="danger">Login failed</PortalBadge>;
  }

  // Guidance strip per state
  let guidance: React.ReactNode = null;
  if (portalState === 'ready') {
    guidance = (
      <GuidanceStrip
        variant="info"
        icon={<Download size={16} />}
        heading="Ready to fetch your records."
        body="Click Fetch records to download labs, visits, medications, and messages. The first run may take a few minutes while we learn your portal's layout."
      />
    );
  } else if (portalState === 'error') {
    guidance = (
      <GuidanceStrip
        variant="error"
        icon={<AlertTriangle size={16} />}
        heading="The portal didn't accept your credentials."
        body="Try signing in directly first — sometimes portals require a security challenge. Then update your saved username and password."
      />
    );
  }

  return (
    <div>
      <Card
        ref={cardRef}
        className={cn(
          'portal-card px-6 py-[22px] flex flex-col gap-3.5',
          isSelected && 'ring-2 ring-[var(--color-fw-primary)]',
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="portal-card-name m-0 mb-1 text-base font-semibold tracking-[-0.005em] text-[var(--color-fw-ink-900)]">
              {portal.name}
            </h2>
            <p className="m-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-[var(--color-fw-fg-muted)]">
              {portal.url}
            </p>
          </div>
          <button
            type="button"
            className="ml-2 flex-shrink-0 cursor-pointer rounded-[var(--radius-sm)] border-none bg-transparent p-1 text-[var(--color-fw-fg-muted)] transition-colors duration-[var(--fw-dur-fast)] hover:bg-[var(--color-fw-bg-deep)] hover:text-[var(--color-fw-ink-900)]"
            aria-label="Edit portal"
            onClick={handleEdit}
            title="Edit portal"
          >
            <Settings size={18} />
          </button>
        </div>

        {/* Badge row */}
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-2">
            {badge}
          </div>
          {portalState === 'fetched' && (
            <RecordCountBadges portal={portal} />
          )}
        </div>

        {/* Guidance strip (new / mapped / error states) */}
        {guidance}

        {/* Meta strip (fetched state only) */}
        {portalState === 'fetched' && (
          <MetaStrip portal={portal} downloadFolder={downloadFolder} />
        )}

        {/* Footer buttons */}
        <div className="flex items-center gap-2">
          {/* Primary action */}
          {portalState === 'error' ? (
            <Button
              type="button"
              size="sm"
              onClick={handleEdit}
            >
              Update credentials
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={handleExtract}
              disabled={extractDisabled}
              title={extractTitle}
            >
              <Download size={14} />
              {isThisRunning && runningOperation?.operation === 'extraction'
                ? 'Running...'
                : portalState === 'fetched' ? 'Fetch again' : 'Fetch records'}
            </Button>
          )}

          {/* Remove — pushed to the right */}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="ml-auto"
            onClick={handleRemove}
          >
            Remove
          </Button>
        </div>
      </Card>
    </div>
  );
}

const QUICKSTART_DISMISSED_KEY = 'quickstartDismissed';

export default function PortalList({ onOpenSettings, onNavigateToApiKey, selectedPortalId, onPortalsChanged, initialView }: PortalListProps) {
  const [view, setView] = useState<View>(initialView === 'add' ? { type: 'add' } : { type: 'list' });
  const [portals, setPortals] = useState<PortalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningOperation, setRunningOperation] = useState<RunningOperation | null>(null);
  const [twoFaPortalId, setTwoFaPortalId] = useState<string | null>(null);
  const [twoFaType, setTwoFaType] = useState<string | undefined>(undefined);
  const [downloadFolder, setDownloadFolder] = useState<string>('~/Documents/HealthRecords');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [quickstartDismissed, setQuickstartDismissed] = useState<boolean>(
    () => localStorage.getItem(QUICKSTART_DISMISSED_KEY) === 'true',
  );

  const loadPortals = useCallback(() => {
    window.electronAPI
      .getPortals()
      .then((data) => {
        setPortals(data);
      })
      .catch(() => {
        setPortals([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadPortals();
  }, [loadPortals]);

  const loadSettings = useCallback(() => {
    window.electronAPI
      .getSettings()
      .then((settings) => {
        if (settings.downloadFolder) {
          setDownloadFolder(settings.downloadFolder);
        }
        setApiKeyConfigured(!!settings.anthropicApiKey);
      })
      .catch(() => {
        // Use default fallback
      });
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Refresh API key state when the user navigates back to this page
  // (e.g., after adding a key in Settings and returning)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadSettings();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadSettings]);

  useEffect(() => {
    if (runningOperation === null) return;

    const handle2FARequest = (payload: { portalId: string; twoFactorType?: string }) => {
      setTwoFaPortalId(payload.portalId);
      if (payload.twoFactorType) {
        setTwoFaType(payload.twoFactorType);
      }
    };

    window.electronAPI.on2FARequest(handle2FARequest);

    return () => {
      window.electronAPI.removeAllListeners('2fa:request');
    };
  }, [runningOperation]);

  const handleSave = () => {
    setView({ type: 'list' });
    loadPortals();
    onPortalsChanged?.();
  };

  const handleCancel = () => {
    setView({ type: 'list' });
  };

  const handleRemove = async (portal: PortalEntry) => {
    try {
      await window.electronAPI.removePortal(portal.id);
      setPortals((prev) => prev.filter((p) => p.id !== portal.id));
      onPortalsChanged?.();
    } catch {
      // Removal failed silently -- user can retry
    }
  };

  const handleExtract = async (portalId: string) => {
    if (runningOperation !== null) return;
    setRunningOperation({ portalId, operation: 'extraction' });
    try {
      await window.electronAPI.runExtraction(portalId);
    } catch {
      // Errors are surfaced via the ProgressPanel error state
    }
  };

  const handleProgressPanelClose = () => {
    setRunningOperation(null);
    loadPortals();
  };

  if (view.type === 'add') {
    return <AddPortal onSave={handleSave} onCancel={handleCancel} />;
  }

  if (view.type === 'edit') {
    return (
      <AddPortal
        onSave={handleSave}
        onCancel={handleCancel}
        editPortal={view.portal}
      />
    );
  }

  return (
    <div className="portal-list-page flex-1 p-10">
      <div className="portal-list-header mb-6 flex items-center justify-between">
        <h1 className="m-0 text-[22px] font-semibold text-[var(--color-fw-fg)]">Your portals</h1>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => setView({ type: 'add' })}
          >
            + Add portal
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onOpenSettings}
            title="Settings"
          >
            Settings
          </Button>
        </div>
      </div>

      {!loading && !quickstartDismissed && (
        <QuickStart
          steps={deriveQuickStartSteps(portals, apiKeyConfigured)}
          onStepClick={(key) => {
            if (key === 'api-key') {
              onNavigateToApiKey();
            } else if (key === 'portal') {
              setView({ type: 'add' });
            } else if (key === 'extract') {
              if (portals.length > 0) {
                handleExtract(portals[0].id);
              }
            }
          }}
          onDismiss={() => {
            setQuickstartDismissed(true);
            localStorage.setItem(QUICKSTART_DISMISSED_KEY, 'true');
          }}
        />
      )}

      {loading ? (
        <PortalListSkeleton />
      ) : portals.length === 0 ? (
        <div className="portal-empty-state flex flex-1 flex-col items-center justify-center gap-4 text-[14px] text-[var(--color-fw-fg-muted)]">
          <p>No portals yet. Add your first health portal to get started.</p>
          <Button
            type="button"
            onClick={() => setView({ type: 'add' })}
          >
            + Add portal
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {portals.map((portal) => (
            <PortalCard
              key={portal.id}
              portal={portal}
              onEdit={(p) => setView({ type: 'edit', portal: p })}
              onRemove={handleRemove}
              onExtract={handleExtract}
              runningOperation={runningOperation}
              isSelected={portal.id === selectedPortalId}
              downloadFolder={downloadFolder}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {runningOperation !== null && (
          <ProgressPanel
            key="progress-panel"
            portalId={runningOperation.portalId}
            operation={runningOperation.operation}
            onClose={handleProgressPanelClose}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {twoFaPortalId !== null && (
          <TwoFactorModal
            key="2fa-modal"
            portalId={twoFaPortalId}
            twoFactorType={twoFaType as 'none' | 'email' | 'manual' | 'ui' | undefined}
            onDismiss={() => { setTwoFaPortalId(null); setTwoFaType(undefined); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
