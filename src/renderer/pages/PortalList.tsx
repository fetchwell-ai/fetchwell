import React from 'react';

interface PortalListProps {
  onOpenSettings: () => void;
}

export default function PortalList({ onOpenSettings }: PortalListProps) {
  return (
    <div className="portal-list-page">
      <h1>Your Portals</h1>
      <p className="placeholder-text">
        No portals added yet. Portal management coming soon.
      </p>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ marginTop: 16 }}
        onClick={onOpenSettings}
      >
        Settings
      </button>
    </div>
  );
}
