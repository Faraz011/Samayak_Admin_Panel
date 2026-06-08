import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, icon, error, ...props }, ref) => {
    return (
      <div
        className={cn(
          'flex items-center gap-2.5 bg-[#eef2f8] border-[1.5px] border-transparent rounded-pill px-4 py-3 transition-all duration-200',
          'focus-within:bg-white focus-within:border-brand-blue focus-within:shadow-[0_0_0_4px_rgba(61,161,255,.16)]',
          error && 'bg-red-50 border-error',
          className
        )}
      >
        {icon && (
          <span className={cn('flex-shrink-0 text-muted', error && 'text-error')}>
            {icon}
          </span>
        )}
        <input
          type={type}
          className="flex-1 bg-transparent border-none outline-none font-medium text-[14.5px] text-ink placeholder:text-muted/60 w-full"
          ref={ref}
          {...props}
        />
      </div>
    );
  }
);
Input.displayName = 'Input';

export { Input };
