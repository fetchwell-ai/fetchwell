import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-block rounded-full text-xs font-medium px-[10px] py-[3px]',
  {
    variants: {
      variant: {
        default: 'bg-[#f5f5f7] text-[#6e6e73] dark:bg-[#3a3a3c] dark:text-[#aeaeb2]',
        success: 'bg-[#e3f0d8] text-[#2e6b0a] dark:bg-[#1a3a10] dark:text-[#4cd964]',
        info: 'bg-[#dbeafe] text-[#1d4ed8] dark:bg-[#1a2a4a] dark:text-[#64a5ff]',
        warning: 'bg-[#fff8ec] text-[#b45309] dark:bg-[#3a2a10] dark:text-[#ffd60a]',
        destructive: 'bg-[#fff1f0] text-[#c0392b] dark:bg-[#3a1010] dark:text-[#ff6b6b]',
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
