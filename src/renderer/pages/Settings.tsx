import React from 'react';

interface SettingsProps {
  onBack: () => void;
}

export default function Settings({ onBack }: SettingsProps) {
  return (
    <div className="settings-page">
      <h1>Settings</h1>
      <p className="placeholder-text">Settings coming soon.</p>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ marginTop: 16 }}
        onClick={onBack}
      >
        Back
      </button>
    </div>
  );
}
