import React from 'react';
import { cn } from '../lib/utils';
import fetchWellMarkSvg from '../assets/fetchwell-mark.svg?raw';

interface SidebarProps {
  portals: PortalEntry[];
  selectedPortalId: string | null;
  activePage: 'portals' | 'settings';
  onSelectPortal: (portalId: string) => void;
  onNavigate: (page: 'portals' | 'settings') => void;
}

function getPortalStatusDot(portal: PortalEntry): string {
  if (portal.lastExtractedAt) return 'bg-[var(--color-fw-moss-600)]';
  if (portal.discoveredAt) return 'bg-[var(--color-fw-primary)]';
  return 'bg-[var(--color-fw-border)]';
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
      className="flex flex-col h-full bg-[var(--color-fw-bg-deep)] border-r border-[var(--color-fw-border)]"
      style={{ width: 240, minWidth: 240, maxWidth: 240 }}
    >
      {/* Title bar drag region -- traffic lights appear here via hiddenInset */}
      <div
        className="flex-shrink-0"
        style={{
          height: 52,
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}
      />

      {/* App logo */}
      <div className="px-4 pb-3 flex-shrink-0">
        <div
          role="img"
          aria-label="FetchWell"
          className="h-6 w-6 select-none [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: fetchWellMarkSvg }}
        />
      </div>

      {/* Portals section label */}
      <div className="px-4 mb-1 flex-shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-fw-fg-muted)] select-none">
          Portals
        </span>
      </div>

      {/* Portal list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {portals.length === 0 ? (
          <p className="px-2 py-1 text-[12px] text-[var(--color-fw-fg-muted)] select-none">
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
                  'w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] text-left transition-colors duration-[var(--fw-dur-fast)]',
                  'text-[13px]',
                  isSelected
                    ? 'bg-[var(--color-fw-primary-tint)] text-[var(--color-fw-primary)] font-medium'
                    : 'text-[var(--color-fw-fg)] hover:bg-[var(--color-fw-border)]',
                )}
              >
                <span
                  className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    isSelected ? 'bg-[var(--color-fw-primary)]' : getPortalStatusDot(portal),
                  )}
                />
                <span className="truncate">{portal.name}</span>
              </button>
            );
          })
        )}
      </div>

      {/* Bottom nav */}
      <div className="flex-shrink-0 border-t border-[var(--color-fw-border)] px-2 py-2">
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] text-left transition-colors duration-[var(--fw-dur-fast)]',
            'text-[13px]',
            activePage === 'settings'
              ? 'bg-[var(--color-fw-primary-tint)] text-[var(--color-fw-primary)] font-medium'
              : 'text-[var(--color-fw-fg-muted)] hover:bg-[var(--color-fw-border)]',
          )}
        >
          <span className="text-[15px] leading-none">&#9881;</span>
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
}
