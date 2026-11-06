'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Compass, User, Phone, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';
import { ScoutStageId, CommitmentPreference } from '@/types';
import { registerMemberAction } from '@/app/actions/scout-actions';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [stageId, setStageId] = useState<ScoutStageId>('stage_2');
  const [commitment, setCommitment] = useState<CommitmentPreference>('committed');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMemberNumber, setSuccessMemberNumber] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || fullName.trim().length < 3) {
      setError('يرجى كتابة الاسم الثلاثي على الأقل');
      return;
    }

    if (!agreedPrivacy) {
      setError('يرجى الموافقة على إقرار الخصوصية وشروط الفوج الكشفي');
      return;
    }

    setIsSubmitting(true);
    try {
      const profile = await registerMemberAction({
        fullName: fullName.trim(),
        stageId,
        commitment,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        password: password || undefined,
      });

      setSuccessMemberNumber(profile.member_number);
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء التسجيل. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-6">
        <Link href="/" className="inline-flex items-center gap-2 group mb-3">
          <div className="w-12 h-12 rounded-2xl bg-forest text-sand-light flex items-center justify-center shadow-md">
            <Compass className="w-7 h-7 text-orange" />
          </div>
        </Link>
        <h2 className="text-2xl font-black text-forest">انضم إلى كشافة هب 🏕️</h2>
        <p className="text-xs text-charcoal/70 mt-1">سجل بياناتك الكشفية واحصل على بطاقتك الرقمية فورًا</p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Card className="bg-white/95 border-sand scout-card-shadow p-6">
          {successMemberNumber ? (
            <div className="text-center py-6 space-y-4 animate-in zoom-in-95 duration-300">
              <div className="w-16 h-16 bg-emerald/10 text-emerald rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-forest">أهلاً بك في الفوج الكشفي! 🏕️</h3>
                <p className="text-xs text-charcoal/70 mt-1">تم إنشاء ملفك وبطاقتك الكشفية بنجاح</p>
              </div>

              <div className="p-4 rounded-2xl bg-sand/30 border border-sand">
                <span className="text-xs text-charcoal/70 block">رقم القيد الكشفي المعتمد:</span>
                <span className="text-xl font-black text-forest font-mono">{successMemberNumber}</span>
              </div>

              <div className="pt-2">
                <Link href="/dashboard">
                  <Button variant="adventure" size="lg" className="w-full">
                    <span>الانتقال إلى لوحتي الكشفية</span>
                    <ArrowLeft className="w-4 h-4 mr-1" />
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-charcoal/80 mb-1">
                  الاسم الكامل (الاسم الثلاثي أو الرباعي) *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="مثال: أحمد محمد علي السيد"
                    className="w-full px-4 py-2.5 rounded-xl border border-sand bg-cream/20 text-sm focus:border-emerald focus:ring-1 focus:ring-emerald outline-none text-right"
                  />
                  <User className="w-4 h-4 text-charcoal/40 absolute left-3 top-3.5" />
                </div>
              </div>

              {/* Scout Stage */}
              <div>
                <label className="block text-xs font-bold text-charcoal/80 mb-1">المرحلة الكشفية *</label>
                <select
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value as ScoutStageId)}
                  className="w-full px-4 py-2.5 rounded-xl border border-sand bg-cream/20 text-sm focus:border-emerald focus:ring-1 focus:ring-emerald outline-none text-right"
                >
                  <option value="stage_1">المرحلة الأولى (الأشبال والزهرات — من 7 إلى 11 سنة)</option>
                  <option value="stage_2">المرحلة الثانية (الفتيان والمرشدات — من 12 إلى 14 سنة)</option>
                  <option value="stage_3">المرحلة الثالثة (المتقدم والرائدات — من 15 إلى 17 سنة)</option>
                </select>
              </div>

              {/* Commitment Preference */}
              <div>
                <label className="block text-xs font-bold text-charcoal/80 mb-1">
                  تفضيل الالتزام الأولي بالحضور *
                </label>
                <select
                  value={commitment}
                  onChange={(e) => setCommitment(e.target.value as CommitmentPreference)}
                  className="w-full px-4 py-2.5 rounded-xl border border-sand bg-cream/20 text-sm focus:border-emerald focus:ring-1 focus:ring-emerald outline-none text-right"
                >
                  <option value="committed">ملتزم بالحضور أسبوعيًا</option>
                  <option value="circumstances">عندي ظروف ومش هقدر أحضر الجمعة، لكن هكون متفاعل على الجروب</option>
                  <option value="inactive">غير ملتزم حاليًا</option>
                </select>
                <p className="text-[11px] text-charcoal/60 mt-1">
                  تنويه: تفضيل الالتزام يساعد في توزيع الفرق ولا يعد غيابًا نهائيًا.
                </p>
              </div>

              {/* Optional Phone */}
              <div>
                <label className="block text-xs font-bold text-charcoal/80 mb-1">
                  رقم الهاتف للتواصل للطوارئ (اختياري وسري)
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="010XXXXXXXX"
                    className="w-full px-4 py-2.5 rounded-xl border border-sand bg-cream/20 text-sm focus:border-emerald focus:ring-1 focus:ring-emerald outline-none text-right font-mono"
                  />
                  <Phone className="w-4 h-4 text-charcoal/40 absolute left-3 top-3.5" />
                </div>
                <p className="text-[10px] text-charcoal/50 mt-1">
                  حماية كاملة: أرقام الهواتف لا تظهر لباقي الكشافة في الطليعة إطلاقًا.
                </p>
              </div>

              {/* Email & Password for Supabase Auth */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-charcoal/80 mb-1">
                    البريد الإلكتروني للحساب
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="scout@example.com"
                    className="w-full px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald focus:ring-1 focus:ring-emerald outline-none text-right"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-charcoal/80 mb-1">
                    كلمة المرور
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald focus:ring-1 focus:ring-emerald outline-none text-right font-mono"
                  />
                </div>
              </div>

              {/* Privacy Acknowledgment */}
              <div className="pt-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedPrivacy}
                    onChange={(e) => setAgreedPrivacy(e.target.checked)}
                    className="w-4 h-4 text-emerald rounded border-sand focus:ring-emerald mt-0.5"
                  />
                  <span className="text-xs text-charcoal/80 leading-snug">
                    أقر بصحة البيانات وأوافق على الالتزام بالقواعد الكشفية وتوجيهات قادة الفوج.
                  </span>
                </label>
              </div>

              <div className="pt-3">
                <Button variant="adventure" size="lg" type="submit" isLoading={isSubmitting} className="w-full">
                  <span>إتمام التسجيل واستلام البطاقة</span>
                </Button>
              </div>

              <div className="text-center pt-2">
                <Link href="/login" className="text-xs text-emerald font-bold hover:underline">
                  لديك حساب بالفعل؟ سجل دخولك من هنا
                </Link>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
