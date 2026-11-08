'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

interface BackButtonProps {
  fallbackUrl?: string;
  label?: string;
  className?: string;
}

export function BackButton({
  fallbackUrl = '/',
  label = 'رجوع',
  className = '',
}: BackButtonProps) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== 'undefined') {
      const isInternalReferrer =
        Boolean(document.referrer) &&
        document.referrer.startsWith(window.location.origin) &&
        !document.referrer.includes('/login') &&
        !document.referrer.includes('/register');

      if (window.history.length > 1 && isInternalReferrer) {
        router.back();
      } else {
        router.push(fallbackUrl);
      }
    } else {
      router.push(fallbackUrl);
    }
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-sand bg-white/90 hover:bg-white text-forest hover:text-emerald text-xs font-bold transition-all shadow-sm active:scale-95 touch-manipulation cursor-pointer ${className}`}
      aria-label={label}
    >
      <ArrowRight className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
      <span>{label}</span>
    </button>
  );
}
