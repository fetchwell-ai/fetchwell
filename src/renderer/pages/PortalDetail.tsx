import React, { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  Activity,
  ArrowLeft,
  Download,
  FileText,
  Folder,
  MessageSquare,
  Pill,
} from 'lucide-react';
import ProgressPanel from '../components/ProgressPanel';
import TwoFactorModal from '../components/TwoFactorModal';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { cn } from '../lib/utils';

export interface PortalDetailProps {
  portalId: string;
  onBack: () => void;
  downloadFolder: string;
}

type PortalState = 'ready' | 'fetched';

interface RunningOperation {
  portalId: string;
  operation: 'extraction';
}

function derivePortalState(portal: PortalEntry): PortalState {
  if (portal.lastExtractedAt !== null) return 'fetched';
  return 'ready';
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        'text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-fw-fg-muted)] mb-3',
        className,
      )}
    >
      {children}
    </h2>
  );
}

// ── Credentials section ─────────────────────────────────────────────────────

function CredentialsSection({
  portalId,
  credentials,
  onSaved,
}: {
  portalId: string;
  credentials: { username: string; hasPassword: boolean } | null;
  onSaved: (creds: { username: string; hasPassword: boolean }) => void;
}) {
  const [username, setUsername] = useState(credentials?.username ?? '');
  // Password field: empty string means "not dirty" — only set when the user types
  const [password, setPassword] = useState('');
  const [passwordDirty, setPasswordDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync username when credentials load from IPC
  React.useEffect(() => {
    if (credentials) {
      setUsername(credentials.username);
      setPassword('');
      setPasswordDirty(false);
    }
  }, [credentials]);

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    setPasswordDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: { username: string; password?: string } = { username };
      if (passwordDirty) {
        updates.password = password;
      }
      await window.electronAPI.updatePortal(portalId, updates);
      onSaved({ username, hasPassword: passwordDirty ? password.length > 0 : (credentials?.hasPassword ?? false) });
    } catch {
      // silently fail — credentials manager handles errors
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setUsername(credentials?.username ?? '');
    setPassword('');
    setPasswordDirty(false);
  };

  return (
    <section className="mb-8">
      <SectionHeader>Credentials</SectionHeader>
      <Card className="px-6 py-5">
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-[var(--color-fw-ink-900)]">
              Username
            </label>
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-[var(--color-fw-ink-900)]">
              Password
            </label>
            <Input
              type="password"
              value={password}
              placeholder={credentials?.hasPassword ? '••••••••' : ''}
              onChange={handlePasswordChange}
            />
            <span className="text-[12px] text-[var(--color-fw-fg-muted)]">
              Stored in macOS Keychain — never sent to Anthropic.
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : credentials ? 'Update' : 'Save'}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={handleCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </Card>
    </section>
  );
}

// ── Record breakdown tile ──────────────────────────────────────────────────────

interface RecordTileProps {
  icon: React.ReactNode;
  count: number;
  label: string;
  accentColor: string;
  iconBg: string;
  iconColor: string;
}

function RecordTile({ icon, count, label, accentColor, iconBg, iconColor }: RecordTileProps) {
  return (
    <div
      className="relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-fw-border)] bg-[var(--color-fw-card-bg)] px-[18px] py-4 flex flex-col gap-1.5 shadow-[var(--shadow-fw-1)]"
      style={{ paddingLeft: 'calc(18px + 3px)' }}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: accentColor }}
      />
      {/* Icon disc */}
      <div
        className="w-7 h-7 rounded-[8px] flex items-center justify-center"
        style={{ background: iconBg, color: iconColor }}
      >
        {icon}
      </div>
      {/* Count */}
      <div
        className="text-[28px] font-medium leading-[32px] tracking-[-0.012em] text-[var(--color-fw-ink-900)]"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {count}
      </div>
      {/* Label */}
      <div className="text-[12px] font-medium text-[var(--color-fw-fg-muted)]">{label}</div>
    </div>
  );
}

// ── History row ────────────────────────────────────────────────────────────────

interface HistoryItem {
  what: string;
  when: string;
  added?: number | null;
}

function deriveHistory(portal: PortalEntry): HistoryItem[] {
  const items: HistoryItem[] = [];
  if (portal.lastExtractedAt) {
    items.push({
      what: 'Last extraction',
      when: new Date(portal.lastExtractedAt).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
      }),
      added: null,
    });
  }
  if (portal.discoveredAt) {
    items.push({
      what: 'Mapping completed',
      when: new Date(portal.discoveredAt).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
      }),
      added: null,
    });
  }
  return items;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PortalDetail({ portalId, onBack, downloadFolder }: PortalDetailProps) {
  const [portal, setPortal] = useState<PortalEntry | null>(null);
  const [credentials, setCredentials] = useState<{ username: string; hasPassword: boolean } | null>(null);
  const [runningOperation, setRunningOperation] = useState<RunningOperation | null>(null);
  const [twoFaPortalId, setTwoFaPortalId] = useState<string | null>(null);
  const [twoFaType, setTwoFaType] = useState<string | undefined>(undefined);
  const [twoFaDeliveryHint, setTwoFaDeliveryHint] = useState<string | undefined>(undefined);
  const [folderPath, setFolderPath] = useState(`${downloadFolder}/${portalId}`);

  // Load portal data
  useEffect(() => {
    window.electronAPI.getPortals().then((portals) => {
      const found = portals.find((p) => p.id === portalId);
      if (found) setPortal(found);
    }).catch(() => {});
  }, [portalId]);

  // Load credentials
  useEffect(() => {
    window.electronAPI.getPortalCredentials(portalId).then((creds) => {
      setCredentials(creds);
    }).catch(() => {});
  }, [portalId]);

  // 2FA listener
  useEffect(() => {
    if (runningOperation === null) return;
    const handle2FARequest = (payload: { portalId: string; twoFactorType?: string; deliveryHint?: string }) => {
      setTwoFaPortalId(payload.portalId);
      if (payload.twoFactorType) {
        setTwoFaType(payload.twoFactorType);
      }
      setTwoFaDeliveryHint(payload.deliveryHint);
    };
    window.electronAPI.on2FARequest(handle2FARequest);
    return () => {
      window.electronAPI.removeAllListeners('2fa:request');
    };
  }, [runningOperation]);

  const handleExtract = async () => {
    if (runningOperation !== null) return;
    setRunningOperation({ portalId, operation: 'extraction' });
    try {
      await window.electronAPI.runExtraction(portalId);
    } catch {
      // Errors surfaced in ProgressPanel
    }
  };

  const handleRemove = async () => {
    const confirmed = window.confirm(
      `Remove "${portal?.name ?? portalId}"? This cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      await window.electronAPI.removePortal(portalId);
      onBack();
    } catch {
      // Silently ignore
    }
  };

  const handleRevealInFinder = () => {
    window.electronAPI.revealInFinder(folderPath).catch(() => {});
  };

  const handleProgressPanelClose = () => {
    setRunningOperation(null);
    // Reload portal data after operation
    window.electronAPI.getPortals().then((portals) => {
      const found = portals.find((p) => p.id === portalId);
      if (found) setPortal(found);
    }).catch(() => {});
  };

  if (!portal) {
    // Loading skeleton — minimal placeholder while data loads
    return (
      <div className="w-full max-w-[860px] px-10 py-10">
        <div className="h-4 w-24 rounded-md bg-[var(--color-fw-bg-deep)] animate-pulse mb-6" />
        <div className="h-8 w-48 rounded-md bg-[var(--color-fw-bg-deep)] animate-pulse mb-3" />
        <div className="h-3 w-64 rounded-md bg-[var(--color-fw-bg-deep)] animate-pulse" />
      </div>
    );
  }

  const portalState = derivePortalState(portal);
  const history = deriveHistory(portal);
  const anyOperationRunning = runningOperation !== null;

  return (
    <div className="w-full max-w-[860px] px-10 py-10">
      {/* Breadcrumb */}
      <button
        type="button"
        className="inline-flex items-center gap-1.5 bg-transparent border-0 cursor-pointer px-2 py-1 -ml-2 mb-4 rounded-[var(--radius-sm)] text-[13px] font-medium text-[var(--color-fw-fg-muted)] hover:bg-[var(--color-fw-bg-deep)] hover:text-[var(--color-fw-ink-900)] transition-colors duration-[var(--fw-dur-fast)]"
        onClick={onBack}
      >
        <ArrowLeft size={14} />
        All portals
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="min-w-0 flex-1">
          <h1
            className="m-0 mb-2 font-medium text-[28px] leading-[34px] tracking-[-0.012em] text-[var(--color-fw-ink-900)]"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {portal.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--color-fw-fg-muted)]">
            <span className="font-mono text-[12px]">{portal.url}</span>
            {portal.lastExtractedAt && (
              <>
                <span className="text-[var(--color-fw-ink-300)]">·</span>
                <span>Last fetched <strong className="text-[var(--color-fw-ink-800)] font-medium">{formatDate(portal.lastExtractedAt)}</strong></span>
              </>
            )}
            {portalState === 'ready' && (
              <>
                <span className="text-[var(--color-fw-ink-300)]">·</span>
                <span>Ready to fetch</span>
              </>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex-shrink-0 flex items-center gap-2 pt-1">
          <Button
            type="button"
            onClick={handleExtract}
            disabled={anyOperationRunning}
          >
            <Download size={14} />
            {portalState === 'fetched' ? 'Fetch again' : 'Fetch records'}
          </Button>
        </div>
      </div>

      {/* Records breakdown (fetched only) */}
      {portalState === 'fetched' && (
        <section className="mb-8">
          <SectionHeader>Records</SectionHeader>
          <div className="grid grid-cols-4 gap-3 mb-3">
            <RecordTile
              icon={<Activity size={16} />}
              count={portal.labCount ?? 0}
              label="Lab results"
              accentColor="var(--color-fw-moss-600)"
              iconBg="var(--color-fw-moss-100)"
              iconColor="var(--color-fw-moss-700)"
            />
            <RecordTile
              icon={<FileText size={16} />}
              count={portal.visitCount ?? 0}
              label="Visit notes"
              accentColor="var(--color-fw-sage-700)"
              iconBg="var(--color-fw-sage-100)"
              iconColor="var(--color-fw-sage-700)"
            />
            <RecordTile
              icon={<Pill size={16} />}
              count={portal.medicationCount ?? 0}
              label="Medications"
              accentColor="var(--color-fw-ochre-600)"
              iconBg="var(--color-fw-ochre-100)"
              iconColor="var(--color-fw-ochre-700)"
            />
            <RecordTile
              icon={<MessageSquare size={16} />}
              count={portal.messageCount ?? 0}
              label="Messages"
              accentColor="var(--color-fw-ink-400)"
              iconBg="var(--color-fw-bg-deep)"
              iconColor="var(--color-fw-ink-700)"
            />
          </div>

          {/* Folder row */}
          <div className="flex items-center gap-2.5 px-[14px] py-[10px] bg-[var(--color-fw-paper-light)] border border-[var(--color-fw-border)] rounded-[var(--radius-sm)] text-[13px] text-[var(--color-fw-ink-700)]">
            <Folder size={14} className="text-[var(--color-fw-fg-muted)] flex-shrink-0" />
            <span className="flex-1 font-mono text-[12px] overflow-hidden text-ellipsis whitespace-nowrap">
              {folderPath}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={async () => {
                const chosen = await window.electronAPI.chooseFolder();
                if (chosen !== null) {
                  await window.electronAPI.updateSettings({ downloadFolder: chosen });
                  setFolderPath(`${chosen}/${portal.id}`);
                }
              }}
            >
              Change
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRevealInFinder}
            >
              Reveal in Finder
            </Button>
          </div>
        </section>
      )}

      {/* Ready state (no records fetched yet) */}
      {portalState === 'ready' && (
        <section className="mb-8">
          <Card
            className="px-6 py-5"
            style={{
              background: 'var(--color-fw-sage-50)',
              borderColor: 'rgba(74,124,89,0.25)',
            }}
          >
            <div className="flex gap-3 items-start">
              <Download
                size={18}
                className="flex-shrink-0 mt-0.5"
                style={{ color: 'var(--color-fw-sage-700)' }}
              />
              <div>
                <h3
                  className="m-0 mb-1.5 text-[15px] font-semibold"
                  style={{ color: 'var(--color-fw-sage-800)' }}
                >
                  Ready to fetch your records
                </h3>
                <p className="m-0 text-[13px] leading-[20px] text-[var(--color-fw-ink-700)]">
                  Click <em>Fetch records</em> to download labs, visits, medications, and messages. The first run may take a few minutes while we learn your portal's layout. During extraction, page content — including health information — is sent to Anthropic's API so Claude can navigate the site.
                </p>
              </div>
            </div>
          </Card>
        </section>
      )}

      {/* History */}
      {history.length > 0 && (
        <section className="mb-8">
          <SectionHeader>History</SectionHeader>
          <div
            className="flex flex-col rounded-[var(--radius-md)] overflow-hidden"
            style={{ gap: 1, background: 'var(--color-fw-border)' }}
          >
            {history.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-[var(--color-fw-card-bg)] px-4 py-3"
              >
                {/* Status dot */}
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: 'var(--color-fw-moss-600)' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[var(--color-fw-ink-900)]">
                    {item.what}
                    {item.added != null && (
                      <span
                        className="font-normal ml-1"
                        style={{ color: 'var(--color-fw-moss-700)' }}
                      >
                        · +{item.added} new
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-[var(--color-fw-fg-muted)] mt-0.5">
                    {item.when}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Credentials */}
      <CredentialsSection
        portalId={portalId}
        credentials={credentials}
        onSaved={(creds) => setCredentials(creds)}
      />

      {/* Danger zone */}
      <section className="mb-8">
        <SectionHeader className="text-[var(--color-fw-crimson-600)]">Danger zone</SectionHeader>
        <Card
          className="px-6 py-5 flex items-center justify-between gap-4"
          style={{ borderColor: '#E0B8B7' }}
        >
          <div>
            <div className="text-[14px] font-medium text-[var(--color-fw-ink-900)] mb-0.5">
              Remove this portal
            </div>
            <div className="text-[13px] text-[var(--color-fw-fg-muted)]">
              Removes this portal and its credentials. Downloaded files stay on disk.
            </div>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleRemove}
          >
            Remove portal
          </Button>
        </Card>
      </section>

      {/* Progress panel overlay */}
      <AnimatePresence>
        {runningOperation !== null && (
          <ProgressPanel
            key="progress-panel"
            portalId={runningOperation.portalId}
            operation={runningOperation.operation}
            onClose={handleProgressPanelClose}
            portalCounts={portal ?? undefined}
          />
        )}
      </AnimatePresence>

      {/* 2FA modal overlay */}
      <AnimatePresence>
        {twoFaPortalId !== null && (
          <TwoFactorModal
            key="2fa-modal"
            portalId={twoFaPortalId}
            twoFactorType={twoFaType as 'none' | 'email' | 'manual' | 'ui' | undefined}
            deliveryHint={twoFaDeliveryHint}
            onDismiss={() => { setTwoFaPortalId(null); setTwoFaType(undefined); setTwoFaDeliveryHint(undefined); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
