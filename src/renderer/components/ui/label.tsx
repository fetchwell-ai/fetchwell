import * as React from 'react';
import { cn } from '../../lib/utils';

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => {
    return (
      <label
        className={cn(
          'block text-[13px] font-medium text-[#1d1d1f]',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Label.displayName = 'Label';

export { Label };
