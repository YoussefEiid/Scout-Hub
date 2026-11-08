'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Compass, User, AlertCircle, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BackButton } from '@/components/ui/BackButton';
import { createClient } from '@/lib/supabase/client';
import { siteBranding } from '@/config/branding';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/dashboard';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getArabicErrorMessage = (msg: string): string => {
    const lower = msg.toLowerCase();
    if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
      return 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
    }
    if (lower.includes('email not confirmed')) {
      return 'يرجى مراجعة بريدك الإلكتروني لتأكيد الحساب أولاً';
    }
    if (lower.includes('rate limit') || lower.includes('too many requests')) {
      return 'تم تجاوز الحد الأقصى للمحاولات، يرجى المحاولة بعد قليل';
    }
    if (lower.includes('user not found')) {
      return 'الحساب غير موجود، يرجى التحقق من البريد أو التسجيل ككشاف جديد';
    }
    return 'تعذر تسجيل الدخول. يرجى التحقق من بياناتك والمحاولة مرة أخرى.';
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    if (!identifier.trim()) {
      setError('يرجى إدخال البريد الإلكتروني');
      return;
    }

    if (!password) {
      setError('يرجى إدخال كلمة المرور');
      return;
    }

    setIsLoading(true);
    setError(null);

    const supabase = createClient();

    if (supabase) {
      try {
        const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
          email: identifier.trim(),
          password,
        });

        if (authErr || !authData?.user) {
          setError(getArabicErrorMessage(authErr?.message || ''));
          setIsLoading(false);
          return;
        }

        let destination = redirectPath;
        if (redirectPath === '/dashboard') {
          const { data: roleRows } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', authData.user.id);
          const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
          if (roles.includes('super_admin')) {
            destination = '/super-admin';
          } else if (
            roles.includes('section_leader') ||
            roles.includes('assistant_leader') ||
            roles.includes('admin') ||
            roles.includes('attendance_leader')
          ) {
            destination = '/leader';
          } else {
            destination = '/dashboard';
          }
        }

        router.push(destination);
        router.refresh();
      } catch (err: any) {
        setError(getArabicErrorMessage(err?.message || ''));
        setIsLoading(false);
      }
    } else {
      setTimeout(() => {
        setIsLoading(false);
        router.push(redirectPath);
      }, 500);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      {/* Top Navigation Bar with Back Button */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex items-center justify-between mb-4">
        <BackButton fallbackUrl="/" label="رجوع للرئيسية" />
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
        <h2 className="text-2xl font-black text-forest">{siteBranding.nameAr} 🏕️</h2>
        <p className="text-xs text-charcoal/70 mt-1">{siteBranding.churchInscription}</p>
        <p className="text-[11px] text-charcoal/50 mt-0.5">تسجيل الدخول إلى البوابة الرقمية</p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Card className="bg-white/95 border-sand scout-card-shadow p-6">
          <form onSubmit={handleLogin} className="space-y-4" noValidate>
            {error && (
              <div className="p-3 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-charcoal/80 mb-1">
                البريد الإلكتروني المعتمد *
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="email"
                  className="w-full px-4 py-2.5 rounded-xl border border-sand bg-cream/20 text-sm focus:border-emerald focus:ring-1 focus:ring-emerald outline-none text-right"
                />
                <User className="w-4 h-4 text-charcoal/40 absolute left-3 top-3.5" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-charcoal/80">كلمة المرور *</label>
                <Link
                  href="/forgot-password"
                  className="text-[11px] text-emerald hover:underline font-medium"
                >
                  نسيت كلمة المرور؟
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full px-4 py-2.5 pl-10 rounded-xl border border-sand bg-cream/20 text-sm focus:border-emerald focus:ring-1 focus:ring-emerald outline-none text-right font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-3 text-charcoal/40 hover:text-charcoal focus:outline-none"
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
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
                <span>دخول</span>
                <ArrowLeft className="w-4 h-4 mr-1" />
              </Button>
            </div>

            <div className="pt-3 border-t border-sand/40 text-center">
              <Link href="/register" className="text-xs text-emerald font-bold hover:underline">
                كشاف جديد؟ سجل بياناتك واستلم بطاقتك الرقمية
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-cream flex items-center justify-center">
          <Compass className="w-8 h-8 text-orange animate-spin" />
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
