import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'emerald' | 'orange' | 'forest' | 'sand' | 'danger' | 'neutral';
  size?: 'sm' | 'md';
}

export function Badge({ className, variant = 'emerald', size = 'md', children, ...props }: BadgeProps) {
  const variants = {
    emerald: 'bg-emerald/10 text-emerald-dark border border-emerald/30',
    orange: 'bg-orange/15 text-orange-hover border border-orange/40 font-bold',
    forest: 'bg-forest text-sand-light border border-forest-hover',
    sand: 'bg-sand text-charcoal border border-sand/80 font-medium',
    danger: 'bg-red-50 text-red-700 border border-red-200',
    neutral: 'bg-gray-100 text-gray-700 border border-gray-200',
  };

  const sizes = {
    sm: 'text-xs px-2 py-0.5 rounded-md gap-1',
    md: 'text-xs sm:text-sm px-2.5 py-1 rounded-lg gap-1.5',
  };

  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center justify-center font-semibold transition-colors',
          variants[variant],
          sizes[size],
          className
        )
      )}
      {...props}
    >
      {children}
    </span>
  );
}
