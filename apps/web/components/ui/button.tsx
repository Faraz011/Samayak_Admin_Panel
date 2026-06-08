import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-brand text-white shadow-[0_8px_20px_rgba(37,97,153,.32)] hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(37,97,153,.4)]',
        secondary:
          'bg-white text-ink border border-line shadow-sm hover:shadow-md hover:-translate-y-0.5',
        dark:
          'bg-[#0b0b0d] text-white hover:-translate-y-0.5 hover:bg-[#1c1c22]',
        ghost:
          'bg-transparent text-brand-deep border-[1.5px] border-line-2 hover:bg-[#eef5fd] hover:border-brand-blue',
        destructive:
          'bg-error text-white hover:-translate-y-0.5 hover:bg-red-600',
        link:
          'text-brand-deep underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-6 text-[14.5px] rounded-pill',
        sm: 'h-9 px-4 text-[13px] rounded-pill',
        lg: 'h-[52px] px-8 text-base rounded-pill',
        icon: 'h-10 w-10 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
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
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
