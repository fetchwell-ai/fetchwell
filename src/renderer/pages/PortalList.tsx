import React, { useCallback, useEffect, useRef, useState } from 'react';
import AddPortal from './AddPortal';
import ProgressPanel from '../components/ProgressPanel';
import TwoFactorModal from '../components/TwoFactorModal';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
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
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

interface PortalCardProps {
  portal: PortalEntry;
  onEdit: (portal: PortalEntry) => void;
  onRemove: (portal: PortalEntry) => void;
  onMap: (portalId: string) => void;
  onExtract: (portalId: string) => void;
  runningOperation: RunningOperation | null;
  isSelected?: boolean;
}

function PortalCard({ portal, onEdit, onRemove, onMap, onExtract, runningOperation, isSelected }: PortalCardProps) {
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

  const handleMap = () => {
    onMap(portal.id);
  };

  const handleExtract = () => {
    onExtract(portal.id);
  };

  const handleRemove = () => {
    const confirmed = window.confirm(
      `Remove "${portal.name}"? This cannot be undone.`,
    );
    if (confirmed) {
      onRemove(portal);
    }
  };

  const extractDisabled = portal.discoveredAt === null;
  const anyOperationRunning = runningOperation !== null;

  const mapDisabled = anyOperationRunning;
  const extractBtnDisabled = extractDisabled || anyOperationRunning;

  const mapTitle = isAnotherRunning
    ? 'Another operation is in progress'
    : isThisRunning && runningOperation?.operation === 'discovery'
      ? 'Discovery running…'
      : undefined;

  const extractTitle = isAnotherRunning
    ? 'Another operation is in progress'
    : extractDisabled
      ? 'Run Map first to enable extraction.'
      : isThisRunning && runningOperation?.operation === 'extraction'
        ? 'Extraction running…'
        : undefined;

  return (
    <Card ref={cardRef} className={cn("portal-card px-6 py-5", isSelected && "ring-2 ring-[#0071e3]")}>
      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="portal-card-name m-0 mb-0.5 text-base font-semibold text-[#1d1d1f]">{portal.name}</h2>
          <p className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[#6e6e73]">{portal.url}</p>
        </div>
        <button
          type="button"
          className="ml-2 flex-shrink-0 cursor-pointer rounded-md border-none bg-transparent p-1 text-[18px] text-[#6e6e73] leading-none transition-colors hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
          aria-label="Edit portal"
          onClick={() => onEdit(portal)}
          title="Edit portal"
        >
          &#9881;
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {portal.discoveredAt === null ? (
          <Badge variant="default">Not mapped yet</Badge>
        ) : (
          <Badge variant="success">
            Mapped {formatDate(portal.discoveredAt)}
          </Badge>
        )}
        {portal.lastExtractedAt && (
          <Badge variant="info">
            Last extracted {formatDate(portal.lastExtractedAt)}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleMap}
          disabled={mapDisabled}
          title={mapTitle}
        >
          {isThisRunning && runningOperation?.operation === 'discovery' ? 'Running…' : 'Map'}
        </Button>

        <div className="group relative inline-flex flex-col">
          <Button
            type="button"
            size="sm"
            onClick={handleExtract}
            disabled={extractBtnDisabled}
            title={extractTitle}
          >
            {isThisRunning && runningOperation?.operation === 'extraction' ? 'Running…' : 'Extract'}
          </Button>
          {extractDisabled && !anyOperationRunning && (
            <p className="extract-tooltip absolute left-1/2 top-[calc(100%+6px)] -translate-x-1/2 z-10 whitespace-nowrap rounded-md bg-[#1d1d1f] px-2.5 py-1.5 text-[11px] text-white opacity-0 pointer-events-none transition-opacity group-hover:opacity-100">
              Run Map first to enable extraction.
            </p>
          )}
          {isAnotherRunning && (
            <p className="extract-tooltip absolute left-1/2 top-[calc(100%+6px)] -translate-x-1/2 z-10 whitespace-nowrap rounded-md bg-[#1d1d1f] px-2.5 py-1.5 text-[11px] text-white opacity-0 pointer-events-none transition-opacity group-hover:opacity-100">
              Another operation is in progress
            </p>
          )}
        </div>

        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="btn-danger"
          onClick={handleRemove}
        >
          Remove
        </Button>
      </div>
    </Card>
  );
}

export default function PortalList({ onOpenSettings, selectedPortalId }: PortalListProps) {
  const [view, setView] = useState<View>({ type: 'list' });
  const [portals, setPortals] = useState<PortalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningOperation, setRunningOperation] = useState<RunningOperation | null>(null);
  const [twoFaPortalId, setTwoFaPortalId] = useState<string | null>(null);

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
      // Removal failed silently — user can retry
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
        <h1 className="m-0 text-[22px] font-semibold">Your Portals</h1>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => setView({ type: 'add' })}
          >
            + Add Portal
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

      {loading ? (
        <p className="text-[14px] text-[#6e6e73]">Loading portals…</p>
      ) : portals.length === 0 ? (
        <div className="portal-empty-state flex flex-1 flex-col items-center justify-center gap-4 text-[14px] text-[#6e6e73]">
          <p>No portals yet. Add your first health portal to get started.</p>
          <Button
            type="button"
            onClick={() => setView({ type: 'add' })}
          >
            + Add Portal
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
            />
          ))}
        </div>
      )}

      {runningOperation !== null && (
        <ProgressPanel
          portalId={runningOperation.portalId}
          operation={runningOperation.operation}
          onClose={handleProgressPanelClose}
        />
      )}

      {twoFaPortalId !== null && (
        <TwoFactorModal
          portalId={twoFaPortalId}
          onDismiss={() => setTwoFaPortalId(null)}
        />
      )}
    </div>
  );
}
