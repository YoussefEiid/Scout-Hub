'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ isOpen, onClose, title, description, children, className }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-charcoal/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={twMerge(
          clsx(
            'relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl border border-sand/60 max-h-[90vh] flex flex-col overflow-hidden',
            className
          )
        )}
      >
        {/* Mobile drag handle bar */}
        <div className="w-12 h-1.5 bg-sand rounded-full mx-auto mb-3 sm:hidden" />

        <div className="flex items-start justify-between gap-3 pb-3 border-b border-sand/40">
          <div>
            <h3 className="text-lg font-bold text-forest">{title}</h3>
            {description && <p className="text-xs sm:text-sm text-charcoal/70 mt-0.5">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="p-1.5 rounded-full text-charcoal/60 hover:text-charcoal hover:bg-sand/30 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto py-4 flex-1">{children}</div>
      </div>
    </div>
  );
}
