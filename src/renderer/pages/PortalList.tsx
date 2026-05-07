import React, { useCallback, useEffect, useState } from 'react';
import AddPortal from './AddPortal';

interface PortalListProps {
  onOpenSettings: () => void;
}

type View =
  | { type: 'list' }
  | { type: 'add' }
  | { type: 'edit'; portal: PortalEntry };

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
}

function PortalCard({ portal, onEdit, onRemove }: PortalCardProps) {
  const [mapStarted, setMapStarted] = useState(false);
  const [extractStarted, setExtractStarted] = useState(false);

  const handleMap = async () => {
    setMapStarted(true);
    try {
      await window.electronAPI.runDiscovery(portal.id);
    } finally {
      setTimeout(() => setMapStarted(false), 2000);
    }
  };

  const handleExtract = async () => {
    setExtractStarted(true);
    try {
      await window.electronAPI.runExtraction(portal.id);
    } finally {
      setTimeout(() => setExtractStarted(false), 2000);
    }
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
          disabled={mapStarted}
        >
          {mapStarted ? 'Started…' : 'Map'}
        </button>

        <div className="extract-btn-wrapper">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleExtract}
            disabled={extractDisabled || extractStarted}
            title={
              extractDisabled ? 'Run Map first to enable extraction.' : undefined
            }
          >
            {extractStarted ? 'Started…' : 'Extract'}
          </button>
          {extractDisabled && (
            <p className="extract-tooltip">Run Map first to enable extraction.</p>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
