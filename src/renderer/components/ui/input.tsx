import * as React from 'react';
import { cn } from '../../lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-fw-border-strong)] bg-[var(--color-fw-card-bg)] px-3 py-1 text-sm text-[var(--color-fw-fg)] shadow-sm transition-colors duration-[var(--fw-dur-fast)] outline-none placeholder:text-[var(--color-fw-fg-subtle)] focus:border-[var(--color-fw-primary)] focus:ring-2 focus:ring-[var(--color-fw-primary)]/20 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
