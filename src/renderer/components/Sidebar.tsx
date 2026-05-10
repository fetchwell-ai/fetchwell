import React, { useState } from 'react';
import { Moon, Key, Folder, Shield, Info, Plus, ChevronRight, Globe } from 'lucide-react';
import { cn } from '../lib/utils';
import fetchWellMarkSvg from '../assets/fetchwell-mark.svg?raw';

export type SettingsKey = 'appearance' | 'key' | 'storage' | 'privacy' | 'about' | 'browser';

interface SidebarProps {
  portals: PortalEntry[];
  activePortalId: string | null;
  activeSettingsKey: SettingsKey | null;
  onSelectPortal: (portalId: string) => void;
  onSelectSettings: (key: SettingsKey) => void;
  onAddPortal: () => void;
}

const SETTINGS_ITEMS: { key: SettingsKey; label: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { key: 'appearance', label: 'Appearance',       Icon: Moon },
  { key: 'key',        label: 'Anthropic API key', Icon: Key },
  { key: 'browser',    label: 'Browser',           Icon: Globe },
  { key: 'storage',    label: 'Storage location',  Icon: Folder },
  { key: 'privacy',    label: 'Privacy & data',    Icon: Shield },
  { key: 'about',      label: 'About Fetchwell',   Icon: Info },
];

function getPortalStatusColor(portal: PortalEntry): string {
  if (portal.lastExtractedAt) return 'var(--color-fw-moss-600)';
  return 'var(--color-fw-sage-700)';
}

export default function Sidebar({
  portals,
  activePortalId,
  activeSettingsKey,
  onSelectPortal,
  onSelectSettings,
  onAddPortal,
}: SidebarProps) {
  const [settingsOpen, setSettingsOpen] = useState(true);

  return (
    <div
      className="flex flex-col h-full bg-[var(--color-fw-bg-deep)] border-r border-[var(--color-fw-border)]"
      style={{ width: 240, minWidth: 240, maxWidth: 240 }}
    >
      {/* Title bar — drag region for traffic lights (hiddenInset).
          With hiddenInset, traffic lights sit at ~x=12, y=8 (14px diameter).
          We use a taller drag region (height 52) and align the logo at
          paddingLeft 16px (matching menu items below) with enough paddingTop
          (16px) so the logo center sits at ~26px — traffic lights are fully
          above at y=8–22px, giving a clean clearance. */}
      <div
        className="flex-shrink-0 flex items-end pb-[10px] pr-3.5 gap-2"
        style={{
          height: 52,
          paddingLeft: 16,
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}
      >
        {/* Logo mark */}
        <div
          role="img"
          aria-label="FetchWell"
          className="h-[20px] w-[20px] flex-shrink-0 select-none [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: fetchWellMarkSvg }}
        />
        {/* Brand wordmark */}
        <span
          className="text-[17px] font-medium leading-none tracking-[-0.01em] text-[var(--color-fw-ink-900)] select-none"
          style={{ fontFamily: 'var(--fw-font-display, inherit)' }}
        >
          fetchwell
        </span>
      </div>

      {/* PORTALS section label — left edge at 16px to match titlebar and item rows */}
      <div className="px-2 pt-2.5 pb-1.5 flex-shrink-0">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fw-fg-muted)] select-none" style={{ paddingLeft: 8 }}>
          Portals
        </span>
      </div>

      {/* Portal list — scrollable */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-0.5">
        {portals.length === 0 ? (
          <p className="py-1 text-[12px] text-[var(--color-fw-fg-muted)] select-none" style={{ paddingLeft: 8 }}>
            No portals yet
          </p>
        ) : (
          portals.map((portal) => {
            const isActive = portal.id === activePortalId && activeSettingsKey === null;
            return (
              <button
                key={portal.id}
                type="button"
                onClick={() => onSelectPortal(portal.id)}
                className={cn(
                  'w-full flex items-center gap-2 py-[7px] rounded-[6px] text-left text-[13px] font-medium border-0 cursor-default transition-colors',
                  isActive
                    ? 'bg-[var(--color-fw-sage-700)] text-[var(--color-fw-paper-light,#F4EFE6)]'
                    : 'text-[var(--color-fw-ink-800)] hover:bg-[rgba(31,77,62,0.06)]',
                )}
                style={{ paddingLeft: 8, paddingRight: 10 }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{
                    background: isActive
                      ? 'var(--color-fw-paper-light, #F4EFE6)'
                      : getPortalStatusColor(portal),
                  }}
                />
                <span className="truncate">{portal.name}</span>
              </button>
            );
          })
        )}

        {/* + Add portal row */}
        <button
          type="button"
          onClick={onAddPortal}
          className="w-full flex items-center gap-2 py-[7px] rounded-[6px] text-left text-[13px] font-medium border-0 cursor-default text-[var(--color-fw-fg-muted)] hover:bg-[rgba(31,77,62,0.06)] transition-colors"
          style={{ paddingLeft: 8, paddingRight: 10 }}
        >
          <Plus size={14} className="flex-shrink-0" />
          <span>Add portal</span>
        </button>
      </div>

      {/* SETTINGS collapsible section label — paddingLeft 16px matches item left edge */}
      <button
        type="button"
        onClick={() => setSettingsOpen((prev) => !prev)}
        className="flex-shrink-0 flex items-center gap-1 pt-3.5 pb-1.5 border-0 bg-transparent cursor-default w-full text-left select-none hover:bg-transparent"
        style={{ paddingLeft: 16 }}
      >
        <ChevronRight
          size={12}
          className="text-[var(--color-fw-fg-muted)] flex-shrink-0 transition-transform duration-[var(--fw-dur-fast,120ms)]"
          style={{ transform: settingsOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-fw-fg-muted)] pl-0.5">
          Settings
        </span>
      </button>

      {/* Settings sub-rows */}
      {settingsOpen && (
        <div className="flex-shrink-0 px-2 pb-1.5 flex flex-col gap-0.5">
          {SETTINGS_ITEMS.map(({ key, label, Icon }) => {
            const isActive = activeSettingsKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectSettings(key)}
                className={cn(
                  'w-full flex items-center gap-2 py-[7px] rounded-[6px] text-left text-[13px] border-0 cursor-default transition-colors',
                  'font-normal',
                  isActive
                    ? 'bg-[var(--color-fw-sage-700)] text-[var(--color-fw-paper-light,#F4EFE6)] font-medium'
                    : 'text-[var(--color-fw-ink-700)] hover:bg-[rgba(31,77,62,0.06)]',
                )}
                style={{ paddingLeft: 8, paddingRight: 10 }}
              >
                <Icon size={14} className="flex-shrink-0 opacity-80" />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Version footer */}
      <div className="flex-shrink-0 border-t border-[var(--color-fw-border)] px-2.5 py-2">
        <div className="flex justify-between items-center px-1 py-0.5">
          <span className="text-[11px] text-[var(--color-fw-fg-muted)] select-none">v0.1.0</span>
          <span
            className="text-[11px] text-[var(--color-fw-fg-muted)] select-none"
            style={{ fontFamily: 'var(--fw-font-mono, monospace)' }}
          >
            local-only
          </span>
        </div>
      </div>
    </div>
  );
}
