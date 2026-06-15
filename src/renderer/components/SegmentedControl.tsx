import React from 'react';
import { cn } from '../lib/utils';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  Icon?: React.ComponentType<{ size?: number }>;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  columns?: number;
}

/**
 * A segmented control (tab-strip) used in Settings pages.
 * Renders a row of buttons with one highlighted as selected.
 */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  columns,
}: SegmentedControlProps<T>) {
  const cols = columns ?? options.length;

  return (
    <div
      className="grid gap-2 p-1 rounded-[var(--radius-md)] border border-[var(--color-fw-border)]"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        background: 'var(--color-fw-bg-deep)',
      }}
    >
      {options.map(({ value: optValue, label, Icon }) => (
        <button
          key={optValue}
          type="button"
          onClick={() => onChange(optValue)}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-[6px] text-[13px] font-medium border cursor-pointer transition-colors duration-[var(--fw-dur-fast,120ms)]',
            value === optValue
              ? 'bg-[var(--color-fw-sage-100)] border-[var(--color-fw-border-focus)] text-[var(--color-fw-ink-900)]'
              : 'bg-transparent border-transparent text-[var(--color-fw-ink-700)] hover:text-[var(--color-fw-ink-900)] hover:bg-[var(--color-fw-card-bg)]',
          )}
        >
          {Icon && <Icon size={14} />}
          {label}
        </button>
      ))}
    </div>
  );
}
