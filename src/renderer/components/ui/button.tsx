import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0071e3] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[#0071e3] text-white shadow hover:bg-[#0077ed]',
        destructive:
          'bg-[#fff1f0] text-[#c0392b] border border-[#f5c6c2] shadow-sm hover:bg-[#ffe4e1] dark:bg-[#3a1a1a] dark:text-[#ff6b6b] dark:border-[#5a2a2a] dark:hover:bg-[#4a1f1f]',
        outline:
          'border border-[#d2d2d7] bg-white shadow-sm hover:bg-[#f5f5f7] hover:text-[#1d1d1f] dark:border-[#3a3a3c] dark:bg-[#2c2c2e] dark:text-[#f5f5f7] dark:hover:bg-[#3a3a3c]',
        secondary:
          'bg-[#e8e8ed] text-[#1d1d1f] shadow-sm hover:bg-[#dcdce0] dark:bg-[#3a3a3c] dark:text-[#f5f5f7] dark:hover:bg-[#48484a]',
        ghost:
          'hover:bg-[#f5f5f7] hover:text-[#1d1d1f] dark:hover:bg-[#3a3a3c] dark:hover:text-[#f5f5f7]',
        link:
          'text-[#0071e3] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
