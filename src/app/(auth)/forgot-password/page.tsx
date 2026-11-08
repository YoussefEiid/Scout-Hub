'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BackButton } from '@/components/ui/BackButton';
import { createClient } from '@/lib/supabase/client';
import { siteBranding } from '@/config/branding';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    if (!email.trim()) {
      setError('يرجى إدخال البريد الإلكتروني المسجل');
      return;
    }

    setIsLoading(true);
    setError(null);

    const supabase = createClient();
    if (supabase) {
      try {
        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined,
        });

        if (resetErr) {
          setError('تعذر إرسال رابط إعادة التعيين. يرجى التأكد من صحة البريد الإلكتروني.');
          setIsLoading(false);
          return;
        }

        setIsSuccess(true);
      } catch {
        setError('حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.');
      } finally {
        setIsLoading(false);
      }
    } else {
      setTimeout(() => {
        setIsSuccess(true);
        setIsLoading(false);
      }, 500);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex items-center justify-between mb-4">
        <BackButton fallbackUrl="/login" label="رجوع لتسجيل الدخول" />
        <Link href="/" className="text-xs font-bold text-forest hover:text-emerald transition-colors">
          {siteBranding.shortName}
        </Link>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-6">
        <Link href="/" className="inline-flex items-center gap-2 group mb-3">
          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-forest shadow-md bg-forest-hover flex items-center justify-center mx-auto transition-transform group-hover:scale-105">
            <Image
              src={siteBranding.logoUrl}
              alt={siteBranding.nameAr}
              width={64}
              height={64}
              className="w-full h-full object-cover"
              priority
            />
          </div>
        </Link>
        <h2 className="text-2xl font-black text-forest">استعادة كلمة المرور</h2>
        <p className="text-xs text-charcoal/70 mt-1">{siteBranding.nameAr}</p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Card className="bg-white/95 border-sand scout-card-shadow p-6">
          {isSuccess ? (
            <div className="text-center py-4 space-y-4">
              <div className="w-14 h-14 bg-emerald/10 text-emerald rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-forest">تم إرسال الرابط بنجاح</h3>
                <p className="text-xs text-charcoal/70 mt-2 leading-relaxed">
                  إذا كان البريد مسجلاً لدينا، ستصلك رسالة تحتوي على رابط لإعادة تعيين كلمة المرور. يرجى مراجعة صندوق الوارد ومجلد البريد غير الهام (Spam).
                </p>
                <p className="text-[11px] text-charcoal/50 mt-2">
                  يمكنك أيضًا التواصل مباشرة مع قائد طليعتك أو مسؤول الفوج للمساعدة.
                </p>
              </div>

              <div className="pt-3">
                <Link href="/login">
                  <Button variant="adventure" size="md" className="w-full">
                    <span>العودة لصفحة الدخول</span>
                    <ArrowLeft className="w-4 h-4 mr-1" />
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {error && (
                <div className="p-3 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <p className="text-xs text-charcoal/70 leading-relaxed">
                أدخل البريد الإلكتروني المسجل في كشافة الفنار، وسنرسل لك رابطاً مباشراً لتعيين كلمة مرور جديدة.
              </p>

              <div>
                <label className="block text-xs font-bold text-charcoal/80 mb-1">
                  البريد الإلكتروني *
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="w-full px-4 py-2.5 rounded-xl border border-sand bg-cream/20 text-sm focus:border-emerald focus:ring-1 focus:ring-emerald outline-none text-right"
                  />
                  <Mail className="w-4 h-4 text-charcoal/40 absolute left-3 top-3.5" />
                </div>
              </div>

              <div className="pt-2">
                <Button
                  variant="adventure"
                  size="lg"
                  type="submit"
                  isLoading={isLoading}
                  disabled={isLoading}
                  className="w-full"
                >
                  <span>إرسال رابط إعادة التعيين</span>
                </Button>
              </div>

              <div className="pt-2 text-center">
                <Link href="/login" className="text-xs text-emerald font-bold hover:underline">
                  تذكرت كلمة المرور؟ تسجيل الدخول
                </Link>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
