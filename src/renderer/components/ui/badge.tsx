import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-block rounded-full text-xs font-medium px-[10px] py-[3px]',
  {
    variants: {
      variant: {
        default: 'bg-[var(--color-fw-bg-deep)] text-[var(--color-fw-fg-muted)]',
        success: 'bg-[var(--color-fw-success-bg)] text-[var(--color-fw-success-fg)]',
        info: 'bg-[var(--color-fw-info-bg)] text-[var(--color-fw-info-fg)]',
        warning: 'bg-[var(--color-fw-warning-bg)] text-[var(--color-fw-warning-fg)]',
        destructive: 'bg-[var(--color-fw-destructive-bg)] text-[var(--color-fw-destructive)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
