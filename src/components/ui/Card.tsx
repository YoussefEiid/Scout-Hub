import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'sand' | 'forest' | 'bordered';
}

export function Card({ className, variant = 'default', children, ...props }: CardProps) {
  const variants = {
    default: 'bg-white text-charcoal border border-sand shadow-sm',
    sand: 'bg-sand/30 text-charcoal border border-sand/60',
    forest: 'bg-forest text-cream border border-forest-hover shadow-md',
    bordered: 'bg-white border-2 border-dashed border-sand/80',
  };

  return (
    <div
      className={twMerge(
        clsx(
          'rounded-2xl p-4 sm:p-5 transition-all duration-200 scout-card-shadow',
          variants[variant],
          className
        )
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={twMerge(clsx('flex items-center justify-between gap-3 mb-3', className))} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={twMerge(clsx('text-base sm:text-lg font-bold text-forest flex items-center gap-2', className))} {...props}>
      {children}
    </h3>
  );
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={twMerge(clsx('text-sm text-charcoal/90 leading-relaxed', className))} {...props}>
      {children}
    </div>
  );
}
