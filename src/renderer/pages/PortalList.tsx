import React, { useCallback, useEffect, useState } from 'react';
import AddPortal from './AddPortal';
import ProgressPanel from '../components/ProgressPanel';

interface PortalListProps {
  onOpenSettings: () => void;
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
}

function PortalCard({ portal, onEdit, onRemove, onMap, onExtract, runningOperation }: PortalCardProps) {
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
    <div className="portal-card">
      <div className="portal-card-header">
        <div className="portal-card-identity">
          <h2 className="portal-card-name">{portal.name}</h2>
          <p className="portal-card-url">{portal.url}</p>
        </div>
        <button
          type="button"
          className="btn-icon"
          aria-label="Edit portal"
          onClick={() => onEdit(portal)}
          title="Edit portal"
        >
          &#9881;
        </button>
      </div>

      <div className="portal-card-status">
        {portal.discoveredAt === null ? (
          <span className="status-badge status-unmapped">Not mapped yet</span>
        ) : (
          <span className="status-badge status-mapped">
            Mapped {formatDate(portal.discoveredAt)}
          </span>
        )}
        {portal.lastExtractedAt && (
          <span className="status-badge status-extracted">
            Last extracted {formatDate(portal.lastExtractedAt)}
          </span>
        )}
      </div>

      <div className="portal-card-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleMap}
          disabled={mapDisabled}
          title={mapTitle}
        >
          {isThisRunning && runningOperation?.operation === 'discovery' ? 'Running…' : 'Map'}
        </button>

        <div className="extract-btn-wrapper">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleExtract}
            disabled={extractBtnDisabled}
            title={extractTitle}
          >
            {isThisRunning && runningOperation?.operation === 'extraction' ? 'Running…' : 'Extract'}
          </button>
          {extractDisabled && !anyOperationRunning && (
            <p className="extract-tooltip">Run Map first to enable extraction.</p>
          )}
          {isAnotherRunning && (
            <p className="extract-tooltip">Another operation is in progress</p>
          )}
        </div>

        <button
          type="button"
          className="btn btn-danger"
          onClick={handleRemove}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

export default function PortalList({ onOpenSettings }: PortalListProps) {
  const [view, setView] = useState<View>({ type: 'list' });
  const [portals, setPortals] = useState<PortalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningOperation, setRunningOperation] = useState<RunningOperation | null>(null);

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
    <div className="portal-list-page">
      <div className="portal-list-header">
        <h1>Your Portals</h1>
        <div className="portal-list-header-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setView({ type: 'add' })}
          >
            + Add Portal
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onOpenSettings}
            title="Settings"
          >
            Settings
          </button>
        </div>
      </div>

      {loading ? (
        <p className="placeholder-text">Loading portals…</p>
      ) : portals.length === 0 ? (
        <div className="portal-empty-state">
          <p>No portals yet. Add your first health portal to get started.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setView({ type: 'add' })}
          >
            + Add Portal
          </button>
        </div>
      ) : (
        <div className="portal-card-grid">
          {portals.map((portal) => (
            <PortalCard
              key={portal.id}
              portal={portal}
              onEdit={(p) => setView({ type: 'edit', portal: p })}
              onRemove={handleRemove}
              onMap={handleMap}
              onExtract={handleExtract}
              runningOperation={runningOperation}
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
    </div>
  );
}
