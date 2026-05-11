import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import PortalList from './pages/PortalList';
import PortalDetail from './pages/PortalDetail';
import Settings from './pages/Settings';
import Sidebar, { type SettingsKey } from './components/Sidebar';
import AppSkeleton from './components/AppSkeleton';
import MotionPage from './components/MotionPage';

export default function App() {
  const [rootPage, setRootPage] = useState<'loading' | 'main'>('loading');

  // v2 nav model: only one of these can be non-null at a time
  const [activePortalId, setActivePortalId] = useState<string | null>(null);
  const [activeSettingsKey, setActiveSettingsKey] = useState<SettingsKey | null>(null);

  const [portals, setPortals] = useState<PortalEntry[]>([]);
  // Increment this key to force PortalList to re-mount (refreshes its own portal data)
  const [portalListKey, setPortalListKey] = useState(0);
  // When true, the next PortalList mount will open in add form mode.
  // Uses a ref so the value survives React batching without needing a reset effect.
  const openAddPortalRef = useRef(false);
  const [downloadFolder, setDownloadFolder] = useState<string>('~/Documents/HealthRecords');

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
        setRootPage('main');
        if (settings.downloadFolder) {
          setDownloadFolder(settings.downloadFolder);
        }
      })
      .catch(() => {
        setRootPage('main');
      });
  }, []);

  // Load portals when entering the main layout, and whenever we switch back to portals view
  const prevIsPortalsView = useRef<boolean | null>(null);
  useEffect(() => {
    if (rootPage !== 'main') return;
    // On initial mount (prevIsPortalsView.current is null) always load portals.
    // Also reload when navigating back to portals from settings.
    if (prevIsPortalsView.current === null || (prevIsPortalsView.current !== isPortalsView && isPortalsView)) {
      loadPortals();
      setPortalListKey((k) => k + 1);
    }
    prevIsPortalsView.current = isPortalsView;
  }, [rootPage, isPortalsView, loadPortals]);


  const handleNavigateToApiKey = () => {
    setActivePortalId(null);
    setActiveSettingsKey('key');
  };

  if (rootPage === 'loading') {
    return <AppSkeleton />;
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
    // Clear active selections and remount PortalList in add form mode
    setActiveSettingsKey(null);
    setActivePortalId(null);
    openAddPortalRef.current = true;
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
          ) : activePortalId !== null ? (
            <MotionPage key={`portal-detail-${activePortalId}`} className="h-full">
              <PortalDetail
                portalId={activePortalId}
                onBack={() => setActivePortalId(null)}
                downloadFolder={downloadFolder}
              />
            </MotionPage>
          ) : (
            <MotionPage key={`portals-${portalListKey}`} className="h-full">
              <PortalList
                key={portalListKey}
                onOpenSettings={() => handleSelectSettings('appearance')}
                onNavigateToApiKey={handleNavigateToApiKey}
                selectedPortalId={activePortalId}
                onPortalsChanged={loadPortals}
                initialView={(() => {
                  if (openAddPortalRef.current) {
                    openAddPortalRef.current = false;
                    return 'add';
                  }
                  return 'list';
                })()}
              />
            </MotionPage>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
