import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  Check,
  Clock,
  Compass,
  Download,
  FileText,
  Folder,
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
  selectedPortalId?: string | null;
}

type View =
  | { type: 'list' }
  | { type: 'add' }
  | { type: 'edit'; portal: PortalEntry };

interface RunningOperation {
  portalId: string;
  operation: 'discovery' | 'extraction';
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

type PortalState = 'new' | 'mapped' | 'fetched' | 'error';

function derivePortalState(portal: PortalEntry): PortalState {
  // 'error' state reserved for future use — requires a lastError field on PortalEntry
  // and corresponding IPC wiring. The error UI (badge, guidance, button) is implemented
  // and ready to activate once the type is extended.
  if (portal.lastExtractedAt !== null) return 'fetched';
  if (portal.discoveredAt !== null) return 'mapped';
  return 'new';
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

// -- PortalCard --

interface PortalCardProps {
  portal: PortalEntry;
  onEdit: (portal: PortalEntry) => void;
  onRemove: (portal: PortalEntry) => void;
  onMap: (portalId: string) => void;
  onExtract: (portalId: string) => void;
  runningOperation: RunningOperation | null;
  isSelected?: boolean;
  downloadFolder: string;
}

function PortalCard({ portal, onEdit, onRemove, onMap, onExtract, runningOperation, isSelected, downloadFolder }: PortalCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const shouldReduce = useReducedMotion();

  useEffect(() => {
    if (isSelected && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isSelected]);

  const isThisRunning =
    runningOperation !== null && runningOperation.portalId === portal.id;
  const isAnotherRunning =
    runningOperation !== null && runningOperation.portalId !== portal.id;

  const handleMap = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMap(portal.id);
  };

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

  const handleCardClick = () => {
    // Placeholder for portal detail navigation (wired in task 6)
  };

  const portalState = derivePortalState(portal);
  const anyOperationRunning = runningOperation !== null;
  const mapDisabled = anyOperationRunning;
  const extractDisabled = portal.discoveredAt === null || anyOperationRunning;

  const mapTitle = isAnotherRunning
    ? 'Another operation is in progress'
    : isThisRunning && runningOperation?.operation === 'discovery'
      ? 'Discovery running...'
      : undefined;

  const extractTitle = isAnotherRunning
    ? 'Another operation is in progress'
    : portal.discoveredAt === null
      ? 'Run Map first to enable extraction.'
      : isThisRunning && runningOperation?.operation === 'extraction'
        ? 'Extraction running...'
        : undefined;

  // Badge per state
  let badge: React.ReactNode;
  if (portalState === 'new') {
    badge = <PortalBadge variant="default">Not mapped yet</PortalBadge>;
  } else if (portalState === 'mapped') {
    badge = <PortalBadge variant="info">Mapped · ready to fetch</PortalBadge>;
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
  if (portalState === 'new') {
    guidance = (
      <GuidanceStrip
        variant="info"
        icon={<Compass size={16} />}
        heading="Next: tell us where your records live."
        body="Click Map — we'll open the portal in a window so you can sign in and walk through the labs, visits, and messages sections. Takes about 2 minutes."
      />
    );
  } else if (portalState === 'mapped') {
    guidance = (
      <GuidanceStrip
        variant="success"
        icon={<Check size={16} />}
        heading="You're ready for the first extraction."
        body="Mapping is done — click Fetch records to download everything. Future extractions are incremental and much faster."
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
    <motion.div
      whileHover={shouldReduce ? undefined : { y: -1, boxShadow: 'var(--shadow-fw-2)' }}
      transition={shouldReduce ? undefined : { type: 'spring', stiffness: 400, damping: 30 }}
      onClick={handleCardClick}
      style={{ cursor: 'default' }}
    >
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
        <div className="flex flex-wrap gap-2">
          {badge}
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
          {portalState === 'new' && (
            <Button
              type="button"
              size="sm"
              onClick={handleMap}
              disabled={mapDisabled}
              title={mapTitle}
            >
              <Compass size={14} />
              {isThisRunning && runningOperation?.operation === 'discovery' ? 'Running...' : 'Map portal'}
            </Button>
          )}
          {portalState === 'mapped' && (
            <Button
              type="button"
              size="sm"
              onClick={handleExtract}
              disabled={extractDisabled}
              title={extractTitle}
            >
              <Download size={14} />
              {isThisRunning && runningOperation?.operation === 'extraction' ? 'Running...' : 'Fetch records'}
            </Button>
          )}
          {portalState === 'fetched' && (
            <Button
              type="button"
              size="sm"
              onClick={handleExtract}
              disabled={extractDisabled}
              title={extractTitle}
            >
              <Download size={14} />
              {isThisRunning && runningOperation?.operation === 'extraction' ? 'Running...' : 'Fetch again'}
            </Button>
          )}
          {portalState === 'error' && (
            <Button
              type="button"
              size="sm"
              onClick={handleEdit}
            >
              Update credentials
            </Button>
          )}

          {/* Re-map button (all states except new) */}
          {portalState !== 'new' && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleMap}
              disabled={mapDisabled}
              title={mapTitle}
            >
              <Compass size={14} />
              {isThisRunning && runningOperation?.operation === 'discovery' ? 'Running...' : 'Re-map'}
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
    </motion.div>
  );
}

const QUICKSTART_DISMISSED_KEY = 'quickstartDismissed';

export default function PortalList({ onOpenSettings, selectedPortalId }: PortalListProps) {
  const [view, setView] = useState<View>({ type: 'list' });
  const [portals, setPortals] = useState<PortalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningOperation, setRunningOperation] = useState<RunningOperation | null>(null);
  const [twoFaPortalId, setTwoFaPortalId] = useState<string | null>(null);
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

  useEffect(() => {
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
    if (runningOperation === null) return;

    const handle2FARequest = (payload: { portalId: string }) => {
      setTwoFaPortalId(payload.portalId);
    };

    window.electronAPI.on2FARequest(handle2FARequest);

    return () => {
      window.electronAPI.removeAllListeners('2fa:request');
    };
  }, [runningOperation]);

  const handleSave = () => {
    setView({ type: 'list' });
    loadPortals();
  };

  const handleCancel = () => {
    setView({ type: 'list' });
  };

  const handleRemove = async (portal: PortalEntry) => {
    try {
      await window.electronAPI.removePortal(portal.id);
      setPortals((prev) => prev.filter((p) => p.id !== portal.id));
    } catch {
      // Removal failed silently -- user can retry
    }
  };

  const handleMap = async (portalId: string) => {
    if (runningOperation !== null) return;
    setRunningOperation({ portalId, operation: 'discovery' });
    try {
      await window.electronAPI.runDiscovery(portalId);
    } catch {
      // Errors are surfaced via the ProgressPanel error state
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
              onMap={handleMap}
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
            onDismiss={() => setTwoFaPortalId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
