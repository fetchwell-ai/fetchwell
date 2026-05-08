import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const alertVariants = cva(
  'rounded-[var(--radius-sm)] border-l-4 p-[10px_12px] text-[13px] leading-relaxed',
  {
    variants: {
      variant: {
        default: 'border-[var(--color-fw-border)] bg-[var(--color-fw-bg-deep)] text-[var(--color-fw-fg-muted)]',
        warning: 'border-[var(--color-fw-ochre-400)] bg-[var(--color-fw-ochre-100)] text-[var(--color-fw-ochre-600)] dark:border-[#D4A043] dark:bg-[#2C2010] dark:text-[#D4A043]',
        destructive: 'border-[var(--color-fw-crimson-500)] bg-[var(--color-fw-crimson-100)] text-[var(--color-fw-crimson-600)] dark:border-[#D44033] dark:bg-[#3A1410] dark:text-[#E8685E]',
        info: 'border-[var(--color-fw-sage-500)] bg-[var(--color-fw-sage-50)] text-[var(--color-fw-sage-700)] dark:border-[#5F8A54] dark:bg-[#1A2E1A] dark:text-[#7BA170]',
        success: 'border-[var(--color-fw-moss-600)] bg-[var(--color-fw-moss-100)] text-[var(--color-fw-moss-600)] dark:border-[#3A7D2C] dark:bg-[#1A3A14] dark:text-[#6BBF5E]',
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
