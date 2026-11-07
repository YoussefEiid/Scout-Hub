import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { siteBranding } from '@/config/branding';

export default function NotFound() {
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

      <span className="text-xs font-bold text-orange mb-1">{siteBranding.nameAr}</span>
      <h1 className="text-3xl font-black text-forest mb-2">الصفحة غير موجودة (404)</h1>
      <p className="text-xs text-charcoal/70 max-w-sm mb-6 leading-relaxed">
        يبدو أن المسار الذي تبحث عنه غير متاح أو تم نقله. يمكنك العودة إلى الصفحة الرئيسية أو تسجيل الدخول.
      </p>

      <div className="flex items-center gap-3">
        <Link href="/">
          <Button variant="adventure" size="md" className="flex items-center gap-2">
            <Home className="w-4 h-4" />
            <span>الصفحة الرئيسية</span>
          </Button>
        </Link>
        <Link href="/dashboard">
          <Button variant="outline" size="md" className="border-sand text-forest">
            <span>لوحتي الكشفية</span>
            <ArrowLeft className="w-4 h-4 mr-1" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
