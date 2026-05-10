import React from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import { cn } from '../lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────

export interface QuickStartStep {
  key: string;
  label: string;
  done: boolean;
  meta?: string;
}

export interface QuickStartProps {
  steps: QuickStartStep[];
  onStepClick?: (key: string) => void;
  onDismiss: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Derive QuickStart steps from real app state.
 * Steps:
 *   0: API key set (apiKeyConfigured)
 *   1: Any portal added (portals.length > 0)
 *   2: First fetch run (any portal has lastExtractedAt)
 */
export function deriveQuickStartSteps(
  portals: PortalEntry[],
  apiKeyConfigured: boolean,
): QuickStartStep[] {
  const hasPortal = portals.length > 0;
  const extractedPortal = portals.find((p) => p.lastExtractedAt !== null);

  const apiKeyDone = apiKeyConfigured;
  const portalDone = hasPortal;
  const extractedDone = extractedPortal !== undefined;

  // Meta: contextual info for each step
  const apiKeyMeta = apiKeyDone ? 'Validated' : undefined;
  const portalMeta = portalDone
    ? portals.length === 1
      ? '1 added'
      : `${portals.length} added`
    : undefined;
  const extractedMeta = extractedDone
    ? formatShortDate(extractedPortal!.lastExtractedAt)
    : undefined;

  return [
    { key: 'api-key', label: 'Add your Anthropic API key', done: apiKeyDone, meta: apiKeyMeta },
    { key: 'portal', label: 'Add a patient portal', done: portalDone, meta: portalMeta },
    { key: 'extract', label: 'Fetch your records', done: extractedDone, meta: extractedMeta },
  ];
}

function formatShortDate(iso: string | null): string | undefined {
  if (!iso) return undefined;
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return undefined;
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export default function QuickStart({ steps, onStepClick, onDismiss }: QuickStartProps) {
  const doneCount = steps.filter((s) => s.done).length;
  const total = steps.length;
  const allDone = doneCount === total;

  // First incomplete step is "current"
  const firstPendingIndex = steps.findIndex((s) => !s.done);

  if (allDone) {
    // Collapsed success bar
    return (
      <div
        className={cn(
          'flex items-center gap-2.5',
          'bg-[var(--color-fw-moss-100)] text-[var(--color-fw-moss-700)]',
          'px-4 py-3 rounded-[var(--radius-md)]',
          'mb-7 border border-[var(--color-fw-moss-100)]',
          'text-[13px] font-medium',
        )}
      >
        <Check size={16} className="flex-shrink-0" />
        <span>
          {"You're all set up. "}
          <button
            type="button"
            onClick={onDismiss}
            className="bg-transparent border-0 text-inherit underline cursor-pointer p-0 font-inherit text-[13px]"
          >
            Dismiss
          </button>
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        'bg-[var(--color-fw-card-bg)]',
        'border border-[var(--color-fw-border)]',
        'rounded-[var(--radius-lg)]',
        'px-[22px] pt-5 pb-[18px]',
        'mb-7',
        'shadow-[var(--shadow-fw-1)]',
      )}
    >
      {/* Left-edge gradient bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{
          background:
            'linear-gradient(180deg, var(--color-fw-sage-700) 0%, var(--color-fw-ochre-500) 100%)',
        }}
      />

      {/* Head row */}
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[var(--color-fw-sage-700)] mb-1.5 m-0">
            Get started
          </p>
          <h3
            className={cn(
              'm-0',
              'font-serif font-medium',
              'text-[22px] leading-7 tracking-[-0.01em]',
              'text-[var(--color-fw-ink-900)]',
            )}
          >
            Three quick steps to your first records.
          </h3>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 pt-1">
          <span className="font-mono text-[12px] text-[var(--color-fw-fg-muted)]">
            {doneCount}&nbsp;/&nbsp;{total}
          </span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={onDismiss}
            className={cn(
              'bg-transparent border-0 p-1 rounded-[var(--radius-sm)] cursor-pointer',
              'text-[var(--color-fw-fg-muted)]',
              'transition-colors duration-[var(--fw-dur-fast)]',
              'hover:bg-[var(--color-fw-bg-deep)] hover:text-[var(--color-fw-ink-900)]',
            )}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Steps list */}
      <ul className="flex flex-col gap-0.5 mt-3.5 p-0 list-none m-0">
        {steps.map((step, i) => {
          const isCurrent = !step.done && i === firstPendingIndex;
          return (
            <li key={step.key}>
              <button
                type="button"
                className={cn(
                  'flex items-center gap-3',
                  'w-full text-left',
                  'px-3 py-2.5 rounded-[8px]',
                  'border-0 font-inherit cursor-pointer',
                  'transition-colors duration-[var(--fw-dur-fast)]',
                  // base
                  'bg-transparent text-[var(--color-fw-ink-900)]',
                  // hover (only non-done steps)
                  !step.done && 'hover:bg-[var(--color-fw-bg-deep)]',
                  // current
                  isCurrent && 'bg-[var(--color-fw-sage-100)]',
                  // done
                  step.done && 'text-[var(--color-fw-fg-muted)] cursor-default',
                )}
                onClick={() => {
                  if (!step.done && onStepClick) {
                    onStepClick(step.key);
                  }
                }}
                disabled={step.done}
              >
                {/* Pill check */}
                <span
                  className={cn(
                    'flex-shrink-0 w-5 h-5 rounded-full',
                    'flex items-center justify-center',
                    'border-[1.5px]',
                    // done: filled moss
                    step.done
                      ? 'bg-[var(--color-fw-moss-600)] border-[var(--color-fw-moss-600)]'
                      : isCurrent
                        ? 'bg-[var(--color-fw-card-bg)] border-[var(--color-fw-sage-700)]'
                        : 'bg-[var(--color-fw-card-bg)] border-[var(--color-fw-border-strong)]',
                  )}
                >
                  {step.done && <Check size={12} className="text-white" strokeWidth={2.5} />}
                </span>

                {/* Label */}
                <span
                  className={cn(
                    'flex-1 text-[14px] font-medium',
                    step.done && 'line-through decoration-[var(--color-fw-ink-300)] decoration-1',
                  )}
                >
                  {step.label}
                </span>

                {/* Meta */}
                {step.meta && (
                  <span className="text-[12px] text-[var(--color-fw-fg-muted)] flex-shrink-0">
                    {step.meta}
                  </span>
                )}

                {/* Arrow (pending only) */}
                {!step.done && (
                  <ArrowRight
                    size={14}
                    className={cn(
                      'flex-shrink-0',
                      isCurrent
                        ? 'text-[var(--color-fw-sage-700)]'
                        : 'text-[var(--color-fw-fg-subtle)]',
                    )}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
