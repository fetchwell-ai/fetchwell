import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const alertVariants = cva(
  'rounded-lg border-l-4 p-[10px_12px] text-[13px] leading-relaxed',
  {
    variants: {
      variant: {
        default: 'border-[#d2d2d7] bg-[#f5f5f7] text-[#3d3d3f] dark:border-[#3a3a3c] dark:bg-[#2c2c2e] dark:text-[#aeaeb2]',
        warning: 'border-[#f59e0b] bg-[#fffbeb] text-[#92400e] dark:border-[#d97706] dark:bg-[#2c1f00] dark:text-[#ffd60a]',
        destructive: 'border-[#ef4444] bg-[#fff1f0] text-[#c0392b] dark:border-[#dc2626] dark:bg-[#2c0a0a] dark:text-[#ff6b6b]',
        info: 'border-[#3b82f6] bg-[#eff6ff] text-[#1d4ed8] dark:border-[#2563eb] dark:bg-[#0a1a2c] dark:text-[#64a5ff]',
        success: 'border-[#34c759] bg-[#e3f0d8] text-[#2e6b0a] dark:border-[#30d158] dark:bg-[#0a2010] dark:text-[#4cd964]',
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
