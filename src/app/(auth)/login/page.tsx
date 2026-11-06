'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Compass, User, Lock, AlertCircle, ArrowLeft, Sparkles, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { createClient } from '@/lib/supabase/client';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/dashboard';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLiveSupabase, setIsLiveSupabase] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    setIsLiveSupabase(Boolean(supabase));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const supabase = createClient();

    if (supabase) {
      // Real Supabase Auth Flow
      try {
        const { error: authErr } = await supabase.auth.signInWithPassword({
          email: identifier.trim(),
          password,
        });

        if (authErr) {
          setError(authErr.message || 'بيانات الدخول غير صحيحة');
          setIsLoading(false);
          return;
        }

        router.push(redirectPath);
      } catch (err: any) {
        setError(err?.message || 'حدث خطأ غير متوقع أثناء الاتصال بقاعدة البيانات');
        setIsLoading(false);
      }
    } else {
      // Offline Demo environment
      setTimeout(() => {
        setIsLoading(false);
        router.push(redirectPath);
      }, 500);
    }
  };

  const handleDemoLogin = (role: 'admin' | 'member') => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      if (role === 'admin') {
        router.push('/admin/scanner');
      } else {
        router.push('/dashboard');
      }
    }, 400);
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-6">
        <Link href="/" className="inline-flex items-center gap-2 group mb-3">
          <div className="w-12 h-12 rounded-2xl bg-forest text-sand-light flex items-center justify-center shadow-md">
            <Compass className="w-7 h-7 text-orange" />
          </div>
        </Link>
        <h2 className="text-2xl font-black text-forest">تسجيل دخول الكشافة والقادة 🏕️</h2>
        <p className="text-xs text-charcoal/70 mt-1">ادخل إلى لوحتك لمتابعة طليعتك وبطاقتك وحضورك</p>

        {isLiveSupabase ? (
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald/10 border border-emerald/30 text-emerald-dark text-[11px] font-bold">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald" />
            <span>متصل بقاعدة بيانات Supabase السحابية (Production Auth)</span>
          </div>
        ) : (
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sand border border-sand-light text-forest text-[11px] font-bold">
            <Sparkles className="w-3.5 h-3.5 text-orange" />
            <span>وضع المعاينة المحلي (Local Demo Mode)</span>
          </div>
        )}
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Card className="bg-white/95 border-sand scout-card-shadow p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-charcoal/80 mb-1">
                البريد الإلكتروني المعتمد
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="leader@scouthub.org"
                  className="w-full px-4 py-2.5 rounded-xl border border-sand bg-cream/20 text-sm focus:border-emerald focus:ring-1 focus:ring-emerald outline-none text-right"
                />
                <User className="w-4 h-4 text-charcoal/40 absolute left-3 top-3.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-charcoal/80 mb-1">كلمة المرور</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 rounded-xl border border-sand bg-cream/20 text-sm focus:border-emerald focus:ring-1 focus:ring-emerald outline-none text-right font-mono"
                />
                <Lock className="w-4 h-4 text-charcoal/40 absolute left-3 top-3.5" />
              </div>
            </div>

            <div className="pt-2">
              <Button variant="adventure" size="lg" type="submit" isLoading={isLoading} className="w-full">
                <span>دخول</span>
                <ArrowLeft className="w-4 h-4 mr-1" />
              </Button>
            </div>

            {/* Quick Demo Access Buttons when in Demo Mode */}
            {!isLiveSupabase && (
              <div className="pt-4 border-t border-sand/40 space-y-2">
                <span className="text-[11px] font-bold text-charcoal/60 block text-center">
                  دخول سريع للمعاينة التجريبية:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => handleDemoLogin('admin')}
                    className="text-xs"
                  >
                    دخول كقائد (Admin)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleDemoLogin('member')}
                    className="text-xs bg-white"
                  >
                    دخول ككشاف (Member)
                  </Button>
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-sand/40 text-center">
              <Link href="/register" className="text-xs text-emerald font-bold hover:underline">
                كشاف جديد؟ سجل حسابك واستلم بطاقتك الرقمية
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
