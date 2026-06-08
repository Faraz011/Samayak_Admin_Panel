import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-pill px-3 py-1 text-xs font-bold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-[#e0efff] text-brand-deep',
        admin: 'bg-[#e0efff] text-[#256199]',
        dean: 'bg-[#eef2ff] text-[#4f46e5]',
        hod: 'bg-[#f3e8ff] text-[#7c3aed]',
        coordinator: 'bg-[#e6fffa] text-[#0d9488]',
        professor: 'bg-[#f1f5f9] text-[#64748b]',
        classroom: 'bg-[#e0efff] text-[#256199]',
        lab: 'bg-[#f3e8ff] text-[#7c3aed]',
        other: 'bg-[#f1f5f9] text-[#64748b]',
        lecture: 'bg-[#e0efff] text-[#256199]',
        tutorial: 'bg-[#e6fffa] text-[#0d9488]',
        success: 'bg-[#e9f7f1] text-success',
        warning: 'bg-[#fef9ee] text-warning',
        error: 'bg-[#fdecee] text-error',
        info: 'bg-[#e0efff] text-info',
        muted: 'bg-[#f1f5f9] text-muted',
        zero: 'bg-[#fef9ee] text-warning border border-warning/20',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
