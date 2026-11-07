'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { siteBranding } from '@/config/branding';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log safe error digest for production observability without leaking sensitive payloads
    console.error('[error-boundary] caught application error:', error.digest || error.name);
  }, [error]);

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-4 text-center">
      <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-forest shadow-lg bg-forest-hover flex items-center justify-center mx-auto mb-4">
        <Image
          src={siteBranding.logoUrl}
          alt={siteBranding.nameAr}
          width={80}
          height={80}
          className="w-full h-full object-cover"
          priority
        />
      </div>

      <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3">
        <AlertCircle className="w-6 h-6" />
      </div>

      <span className="text-xs font-bold text-orange mb-1">{siteBranding.nameAr}</span>
      <h1 className="text-2xl font-black text-forest mb-2">عذرًا، حدث خطأ غير متوقع</h1>
      <p className="text-xs text-charcoal/70 max-w-sm mb-6 leading-relaxed">
        حدث اضطراب مؤقت أثناء معالجة الطلب. تم تسجيل رمز المشكلة، يمكنك إعادة المحاولة الآن.
      </p>

      <div className="flex items-center gap-3">
        <Button variant="adventure" size="md" onClick={() => reset()} className="flex items-center gap-2">
          <RotateCcw className="w-4 h-4" />
          <span>إعادة المحاولة</span>
        </Button>
        <Link href="/">
          <Button variant="outline" size="md" className="border-sand text-forest flex items-center gap-2">
            <Home className="w-4 h-4" />
            <span>الرئيسية</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}
