import * as React from 'react';
import { cn } from '../../lib/utils';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        className={cn(
          'flex h-9 w-full appearance-none rounded-[var(--radius-md)] border border-[var(--color-fw-border-strong)] bg-[var(--color-fw-card-bg)] px-3 py-1 pr-8 text-sm text-[var(--color-fw-fg)] shadow-sm outline-none transition-colors duration-[var(--fw-dur-fast)] cursor-pointer focus:border-[var(--color-fw-primary)] focus:ring-2 focus:ring-[var(--color-fw-primary)]/20 disabled:cursor-not-allowed disabled:opacity-50',
          "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%237A756C' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")] bg-no-repeat bg-[right_12px_center]",
          className,
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    );
  },
);
Select.displayName = 'Select';

export { Select };
