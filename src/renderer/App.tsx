import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import Welcome from './pages/Welcome';
import PortalList from './pages/PortalList';
import Settings from './pages/Settings';
import Sidebar, { type SettingsKey } from './components/Sidebar';
import AppSkeleton from './components/AppSkeleton';
import MotionPage from './components/MotionPage';

export default function App() {
  // null = still loading; 'welcome' = show wizard; otherwise show sidebar layout
  const [rootPage, setRootPage] = useState<'loading' | 'welcome' | 'main'>(
    'loading',
  );

  // v2 nav model: only one of these can be non-null at a time
  const [activePortalId, setActivePortalId] = useState<string | null>(null);
  const [activeSettingsKey, setActiveSettingsKey] = useState<SettingsKey | null>(null);

  const [portals, setPortals] = useState<PortalEntry[]>([]);
  // Increment this key to force PortalList to re-mount (refreshes its own portal data)
  const [portalListKey, setPortalListKey] = useState(0);

  // Track whether we're showing the portal list view vs a portal detail or settings view
  // "portals" view = no activePortalId and no activeSettingsKey, OR activePortalId is set
  // "settings" view = activeSettingsKey is set
  const isSettingsView = activeSettingsKey !== null;
  const isPortalsView = !isSettingsView;

  const loadPortals = useCallback(() => {
    window.electronAPI
      .getPortals()
      .then((data) => {
        setPortals(data);
        setActivePortalId((prev) => {
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

  // Load portals when entering the main layout, and whenever we switch back to portals view
  const prevIsPortalsView = useRef<boolean | null>(null);
  useEffect(() => {
    if (rootPage !== 'main') return;
    // On first entry, or when navigating back to portals from settings
    if (prevIsPortalsView.current !== isPortalsView && isPortalsView) {
      loadPortals();
      setPortalListKey((k) => k + 1);
    }
    prevIsPortalsView.current = isPortalsView;
  }, [rootPage, isPortalsView, loadPortals]);

  if (rootPage === 'loading') {
    return <AppSkeleton />;
  }

  if (rootPage === 'welcome') {
    return <Welcome onComplete={() => setRootPage('main')} />;
  }

  // ── Sidebar layout ────────────────────────────────────────────────────────

  const handleSelectPortal = (portalId: string) => {
    setActiveSettingsKey(null);
    setActivePortalId(portalId);
  };

  const handleSelectSettings = (key: SettingsKey) => {
    setActivePortalId(null);
    setActiveSettingsKey(key);
  };

  const handleAddPortal = () => {
    // Clear active selections and navigate to portals list where Add is available
    setActiveSettingsKey(null);
    setActivePortalId(null);
    setPortalListKey((k) => k + 1);
  };

  const handleBackFromSettings = () => {
    setActiveSettingsKey(null);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-fw-bg)]">
      <Sidebar
        portals={portals}
        activePortalId={activePortalId}
        activeSettingsKey={activeSettingsKey}
        onSelectPortal={handleSelectPortal}
        onSelectSettings={handleSelectSettings}
        onAddPortal={handleAddPortal}
      />

      {/* Content area */}
      <div className="flex-1 overflow-y-auto relative">
        <AnimatePresence mode="wait" initial={false}>
          {isSettingsView ? (
            <MotionPage key={`settings-${activeSettingsKey}`} className="h-full">
              <Settings
                activeKey={activeSettingsKey}
                onBack={handleBackFromSettings}
              />
            </MotionPage>
          ) : (
            <MotionPage key={`portals-${portalListKey}`} className="h-full">
              <PortalList
                key={portalListKey}
                onOpenSettings={() => handleSelectSettings('appearance')}
                selectedPortalId={activePortalId}
              />
            </MotionPage>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
