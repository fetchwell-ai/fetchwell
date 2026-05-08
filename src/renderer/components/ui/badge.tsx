import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-block rounded-full text-xs font-medium px-[10px] py-[3px]',
  {
    variants: {
      variant: {
        default: 'bg-[var(--color-fw-bg-deep)] text-[var(--color-fw-fg-muted)]',
        success: 'bg-[var(--color-fw-moss-100)] text-[var(--color-fw-moss-600)] dark:bg-[#1A3A14] dark:text-[#6BBF5E]',
        info: 'bg-[var(--color-fw-sage-100)] text-[var(--color-fw-sage-700)] dark:bg-[#1A2E1A] dark:text-[#7BA170]',
        warning: 'bg-[var(--color-fw-ochre-100)] text-[var(--color-fw-ochre-600)] dark:bg-[#2C2010] dark:text-[#D4A043]',
        destructive: 'bg-[var(--color-fw-crimson-100)] text-[var(--color-fw-crimson-600)] dark:bg-[#3A1410] dark:text-[#E8685E]',
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
