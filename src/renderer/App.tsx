import React, { useCallback, useEffect, useRef, useState } from 'react';
import Welcome from './pages/Welcome';
import PortalList from './pages/PortalList';
import Settings from './pages/Settings';
import Sidebar from './components/Sidebar';

type ActivePage = 'portals' | 'settings';

export default function App() {
  // null = still loading; 'welcome' = show wizard; otherwise show sidebar layout
  const [rootPage, setRootPage] = useState<'loading' | 'welcome' | 'main'>(
    'loading',
  );
  const [activePage, setActivePage] = useState<ActivePage>('portals');
  const [selectedPortalId, setSelectedPortalId] = useState<string | null>(null);
  const [portals, setPortals] = useState<PortalEntry[]>([]);
  // Increment this key to force PortalList to re-mount (refreshes its own portal data)
  const [portalListKey, setPortalListKey] = useState(0);

  const loadPortals = useCallback(() => {
    window.electronAPI
      .getPortals()
      .then((data) => {
        setPortals(data);
        setSelectedPortalId((prev) => {
          if (prev !== null && !data.some((p) => p.id === prev)) {
            return data.length > 0 ? data[0].id : null;
          }
          return prev;
        });
      })
      .catch(() => {
        setPortals([]);
      });
  }, []);

  useEffect(() => {
    window.electronAPI
      .getSettings()
      .then((settings) => {
        setRootPage(settings.apiKeyConfigured ? 'main' : 'welcome');
      })
      .catch(() => {
        setRootPage('welcome');
      });
  }, []);

  // Load portals when entering the main layout, and whenever activePage switches to portals
  const prevActivePage = useRef<ActivePage | null>(null);
  useEffect(() => {
    if (rootPage !== 'main') return;
    // On first entry, or when navigating back to portals from settings
    if (prevActivePage.current !== activePage && activePage === 'portals') {
      loadPortals();
      setPortalListKey((k) => k + 1);
    }
    prevActivePage.current = activePage;
  }, [rootPage, activePage, loadPortals]);

  // Initial portal load when entering main layout
  useEffect(() => {
    if (rootPage === 'main') {
      loadPortals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootPage]);

  if (rootPage === 'loading') {
    return null;
  }

  if (rootPage === 'welcome') {
    return <Welcome onComplete={() => setRootPage('main')} />;
  }

  // ── Sidebar layout ────────────────────────────────────────────────────────

  const handleSelectPortal = (portalId: string) => {
    setSelectedPortalId(portalId);
    setActivePage('portals');
  };

  const handleNavigate = (page: ActivePage) => {
    setActivePage(page);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f5f7]">
      <Sidebar
        portals={portals}
        selectedPortalId={selectedPortalId}
        activePage={activePage}
        onSelectPortal={handleSelectPortal}
        onNavigate={handleNavigate}
      />

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {activePage === 'settings' ? (
          <Settings onBack={() => setActivePage('portals')} />
        ) : (
          <PortalList
            key={portalListKey}
            onOpenSettings={() => setActivePage('settings')}
          />
        )}
      </div>
    </div>
  );
}
