import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] text-sm font-medium transition-colors duration-[var(--fw-dur-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-fw-primary)] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--color-fw-primary)] text-[var(--color-fw-primary-foreground)] shadow-[var(--shadow-fw-1)] hover:bg-[var(--color-fw-primary-hover)]',
        destructive:
          'bg-[var(--color-fw-crimson-100)] text-[var(--color-fw-crimson-600)] border border-[var(--color-fw-crimson-500)] shadow-sm hover:bg-[#F9DBD8] dark:bg-[#3A1A16] dark:text-[#E8685E] dark:border-[#5A2A24] dark:hover:bg-[#4A201A]',
        outline:
          'border border-[var(--color-fw-border)] bg-[var(--color-fw-card-bg)] shadow-sm hover:bg-[var(--color-fw-bg)] hover:text-[var(--color-fw-fg)]',
        secondary:
          'bg-[var(--color-fw-bg-deep)] text-[var(--color-fw-fg)] shadow-sm hover:bg-[var(--color-fw-border)]',
        ghost:
          'hover:bg-[var(--color-fw-bg-deep)] hover:text-[var(--color-fw-fg)]',
        link:
          'text-[var(--color-fw-primary)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-[var(--radius-sm)] px-3 text-xs',
        lg: 'h-10 rounded-[var(--radius-md)] px-8',
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
