import React from 'react';
import { cn } from '../lib/utils';
import fetchWellMark from '../assets/fetchwell-mark.svg';

interface SidebarProps {
  portals: PortalEntry[];
  selectedPortalId: string | null;
  activePage: 'portals' | 'settings';
  onSelectPortal: (portalId: string) => void;
  onNavigate: (page: 'portals' | 'settings') => void;
}

function getPortalStatusDot(portal: PortalEntry): string {
  if (portal.lastExtractedAt) return 'bg-[#34c759]';
  if (portal.discoveredAt) return 'bg-[#0071e3]';
  return 'bg-[#d2d2d7] dark:bg-[#48484a]';
}

export default function Sidebar({
  portals,
  selectedPortalId,
  activePage,
  onSelectPortal,
  onNavigate,
}: SidebarProps) {
  return (
    <div
      className="flex flex-col h-full bg-[#f0f0f5] dark:bg-[#28282a] border-r border-[#d2d2d7] dark:border-[#3a3a3c]"
      style={{ width: 240, minWidth: 240, maxWidth: 240 }}
    >
      {/* Title bar drag region — traffic lights appear here via hiddenInset */}
      <div
        className="flex-shrink-0"
        style={{
          height: 52,
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}
      />

      {/* App logo */}
      <div className="px-4 pb-3 flex-shrink-0">
        <img src={fetchWellMark} alt="FetchWell" className="h-6 w-6 select-none" />
      </div>

      {/* Portals section label */}
      <div className="px-4 mb-1 flex-shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[#6e6e73] select-none">
          Portals
        </span>
      </div>

      {/* Portal list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {portals.length === 0 ? (
          <p className="px-2 py-1 text-[12px] text-[#6e6e73] select-none">
            No portals yet
          </p>
        ) : (
          portals.map((portal) => {
            const isSelected =
              activePage === 'portals' && portal.id === selectedPortalId;
            return (
              <button
                key={portal.id}
                type="button"
                onClick={() => onSelectPortal(portal.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors',
                  'text-[13px] font-medium',
                  isSelected
                    ? 'bg-[#0071e3] text-white'
                    : 'text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-[#e4e4ea] dark:hover:bg-[#3a3a3c]',
                )}
              >
                <span
                  className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    isSelected ? 'bg-white/70' : getPortalStatusDot(portal),
                  )}
                />
                <span className="truncate">{portal.name}</span>
              </button>
            );
          })
        )}
      </div>

      {/* Bottom nav */}
      <div className="flex-shrink-0 border-t border-[#d2d2d7] dark:border-[#3a3a3c] px-2 py-2">
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors',
            'text-[13px] font-medium',
            activePage === 'settings'
              ? 'bg-[#0071e3] text-white'
              : 'text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-[#e4e4ea] dark:hover:bg-[#3a3a3c]',
          )}
        >
          <span className="text-[15px] leading-none">&#9881;</span>
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
}
