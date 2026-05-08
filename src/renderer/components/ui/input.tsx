import * as React from 'react';
import { cn } from '../../lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-[#d2d2d7] bg-white px-3 py-1 text-sm text-[#1d1d1f] shadow-sm transition-colors outline-none placeholder:text-[#aaa] focus:border-[#0071e3] disabled:cursor-not-allowed disabled:opacity-50',
          'dark:border-[#3a3a3c] dark:bg-[#1c1c1e] dark:text-[#f5f5f7] dark:placeholder:text-[#6e6e73] dark:focus:border-[#0a84ff]',
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
