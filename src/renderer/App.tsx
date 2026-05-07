import React, { useEffect, useState } from 'react';
import Welcome from './pages/Welcome';
import PortalList from './pages/PortalList';
import Settings from './pages/Settings';

type Page = 'welcome' | 'portals' | 'settings';

export default function App() {
  const [page, setPage] = useState<Page | null>(null);

  useEffect(() => {
    window.electronAPI
      .getSettings()
      .then((settings) => {
        setPage(settings.apiKeyConfigured ? 'portals' : 'welcome');
      })
      .catch(() => {
        // Fall back to welcome on any error
        setPage('welcome');
      });
  }, []);

  if (page === null) {
    // Loading — blank while we check settings
    return null;
  }

  if (page === 'welcome') {
    return <Welcome onComplete={() => setPage('portals')} />;
  }

  if (page === 'settings') {
    return <Settings onBack={() => setPage('portals')} />;
  }

  return <PortalList onOpenSettings={() => setPage('settings')} />;
}
