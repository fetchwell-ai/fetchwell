import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const alertVariants = cva(
  'rounded-[var(--radius-sm)] border-l-4 p-[10px_12px] text-[13px] leading-relaxed',
  {
    variants: {
      variant: {
        default: 'border-[var(--color-fw-border)] bg-[var(--color-fw-bg-deep)] text-[var(--color-fw-fg-muted)]',
        warning: 'border-[var(--color-fw-warning-border)] bg-[var(--color-fw-warning-bg)] text-[var(--color-fw-warning-fg)]',
        destructive: 'border-[var(--color-fw-destructive-border)] bg-[var(--color-fw-destructive-bg)] text-[var(--color-fw-destructive)]',
        info: 'border-[var(--color-fw-info-border)] bg-[var(--color-fw-info-bg)] text-[var(--color-fw-info-fg)]',
        success: 'border-[var(--color-fw-success-border)] bg-[var(--color-fw-success-bg)] text-[var(--color-fw-success-fg)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = 'Alert';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-[14px] leading-[1.5]', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertDescription, alertVariants };
