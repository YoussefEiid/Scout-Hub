'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  User,
  Phone,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Layers,
  Calendar,
  Lock,
  Mail,
  Eye,
  EyeOff,
} from 'lucide-react';
import { CommitmentPreference, ScoutSection } from '@/types';
import { registerMemberAction, getActiveScoutSectionsAction } from '@/app/actions/scout-actions';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BackButton } from '@/components/ui/BackButton';
import { siteBranding } from '@/config/branding';

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [sections, setSections] = useState<ScoutSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [commitment, setCommitment] = useState<CommitmentPreference | ''>('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingSections, setIsLoadingSections] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMemberNumber, setSuccessMemberNumber] = useState<string | null>(null);

  useEffect(() => {
    async function loadSections() {
      try {
        const data = await getActiveScoutSectionsAction();
        setSections(data || []);
        // Neutral initial state: do not automatically select any section or year
      } catch (err) {
        console.error('Failed to load active sections', err);
      } finally {
        setIsLoadingSections(false);
      }
    }
    loadSections();
  }, []);

  const currentSection = sections.find((s) => s.id === selectedSectionId);
  const currentYears = currentSection?.years || [];

  const handleSectionChange = (sectionId: string) => {
    setSelectedSectionId(sectionId);
    // When the selected section changes, reset the year selection
    setSelectedYearId('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    if (!fullName.trim() || fullName.trim().length < 3) {
      setError('يرجى كتابة الاسم الثلاثي أو الرباعي');
      return;
    }

    if (!selectedSectionId) {
      setError('يرجى اختيار القسم الكشفي');
      return;
    }

    if (!selectedYearId) {
      setError('يرجى اختيار السنة الكشفية / المستوى');
      return;
    }

    if (!commitment) {
      setError('يرجى اختيار حالة الالتزام بالحضور');
      return;
    }

    if (!email.trim() || !password) {
      setError('البريد الإلكتروني وكلمة المرور مطلوبان لإنشاء الحساب');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('يرجى إدخال بريد إلكتروني صالح');
      return;
    }

    if (password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
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
        sectionId: selectedSectionId,
        yearId: selectedYearId,
        commitment: commitment as CommitmentPreference,
        phone: phone.trim() || undefined,
        email: email.trim(),
        password,
      });

      setSuccessMemberNumber(profile.member_number);
    } catch (err: any) {
      const msg = err?.message || '';
      if (
        msg.includes('441') ||
        msg.includes('Server Components') ||
        msg.includes('digest') ||
        msg.includes('Minified React error')
      ) {
        setError('تعذر إتمام التسجيل بسبب خطأ مؤقت في الخادم. يرجى مراجعة البيانات والمحاولة لاحقًا.');
      } else if (msg.includes('already registered') || msg.includes('User already registered')) {
        setError('هذا البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول أو استخدام بريد آخر.');
      } else {
        setError(msg || 'حدث خطأ أثناء التسجيل. يرجى مراجعة البيانات والمحاولة مرة أخرى.');
      }
    } finally {
      setIsSubmitting(false);
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
        <h2 className="text-2xl font-black text-forest">انضم إلى {siteBranding.nameAr} 🏕️</h2>
        <p className="text-xs text-charcoal/70 mt-1">{siteBranding.churchInscription}</p>
        <p className="text-[11px] text-charcoal/50 mt-0.5">سجل بياناتك الكشفية واحصل على بطاقتك الرقمية فورًا</p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Card className="bg-white/95 border-sand scout-card-shadow p-6">
          {successMemberNumber ? (
            <div className="text-center py-6 space-y-4 animate-in zoom-in-95 duration-300">
              <div className="w-16 h-16 bg-emerald/10 text-emerald rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-forest">أهلاً بيك في {siteBranding.nameAr}! 🏕️</h3>
                <p className="text-xs text-charcoal/70 mt-1">
                  تم إنشاء حسابك وبطاقتك الكشفية بنجاح في {siteBranding.groupNameAr}.
                </p>
                <p className="text-xs text-emerald-dark font-medium mt-2 bg-emerald/10 p-2.5 rounded-xl border border-emerald/20">
                  راجع بريدك الإلكتروني لتأكيد حسابك، وبعدها تقدر تسجل الدخول.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-sand/30 border border-sand">
                <span className="text-xs text-charcoal/70 block">رقم القيد الكشفي المعتمد:</span>
                <span className="text-xl font-black text-forest font-mono">{successMemberNumber}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                <Link href="/login" className="w-full">
                  <Button variant="adventure" size="md" className="w-full">
                    <span>تسجيل الدخول</span>
                    <ArrowLeft className="w-4 h-4 mr-1" />
                  </Button>
                </Link>
                <Link href="/dashboard" className="w-full">
                  <Button variant="outline" size="md" className="w-full bg-white">
                    <span>لوحتي الكشفية</span>
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
                    autoComplete="name"
                    className="w-full px-4 py-2.5 rounded-xl border border-sand bg-cream/20 text-sm focus:border-emerald focus:ring-1 focus:ring-emerald outline-none text-right"
                  />
                  <User className="w-4 h-4 text-charcoal/40 absolute left-3 top-3.5" />
                </div>
              </div>

              {/* Scout Section Selection (Dynamic) */}
              <div>
                <label className="block text-xs font-bold text-charcoal/80 mb-1">
                  القسم الكشفي *
                </label>
                <div className="relative">
                  <select
                    value={selectedSectionId}
                    onChange={(e) => handleSectionChange(e.target.value)}
                    disabled={isLoadingSections}
                    className="w-full px-4 py-2.5 rounded-xl border border-sand bg-cream/20 text-sm focus:border-emerald focus:ring-1 focus:ring-emerald outline-none text-right"
                  >
                    <option value="">اختر القسم الكشفي</option>
                    {sections.map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        {sec.name} {sec.description ? `(${sec.description})` : ''}
                      </option>
                    ))}
                  </select>
                  <Layers className="w-4 h-4 text-charcoal/40 absolute left-3 top-3.5 pointer-events-none" />
                </div>
              </div>

              {/* Section Year Selection (Cascading Dynamic) */}
              <div>
                <label className="block text-xs font-bold text-charcoal/80 mb-1">
                  السنة الكشفية / المستوى *
                </label>
                <div className="relative">
                  <select
                    value={selectedYearId}
                    onChange={(e) => setSelectedYearId(e.target.value)}
                    disabled={isLoadingSections || !selectedSectionId || currentYears.length === 0}
                    className="w-full px-4 py-2.5 rounded-xl border border-sand bg-cream/20 text-sm focus:border-emerald focus:ring-1 focus:ring-emerald outline-none text-right disabled:opacity-50 disabled:bg-sand/20"
                  >
                    <option value="">اختر السنة الكشفية</option>
                    {currentYears.map((yr) => (
                      <option key={yr.id} value={yr.id}>
                        {yr.name}
                      </option>
                    ))}
                  </select>
                  <Calendar className="w-4 h-4 text-charcoal/40 absolute left-3 top-3.5 pointer-events-none" />
                </div>
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
                  <option value="">اختر حالة الالتزام</option>
                  <option value="committed">ملتزم بالحضور أسبوعيًا</option>
                  <option value="circumstances">عندي ظروف ولن أستطيع الحضور أسبوعيًا بانتظام</option>
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
                    autoComplete="tel"
                    className="w-full px-4 py-2.5 rounded-xl border border-sand bg-cream/20 text-sm focus:border-emerald focus:ring-1 focus:ring-emerald outline-none text-right font-mono"
                  />
                  <Phone className="w-4 h-4 text-charcoal/40 absolute left-3 top-3.5" />
                </div>
                <p className="text-[10px] text-charcoal/50 mt-1">
                  حماية كاملة: أرقام الهواتف سرية ولا تظهر لباقي الكشافة في الطليعة.
                </p>
              </div>

              {/* Email & Password for Supabase Auth */}
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-charcoal/80 mb-1">
                    البريد الإلكتروني للحساب *
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
                <div>
                  <label className="block text-xs font-bold text-charcoal/80 mb-1">
                    كلمة المرور (6 أحرف على الأقل) *
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
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
                    <Lock className="w-4 h-4 text-charcoal/40 absolute right-3 top-3.5 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Privacy Acknowledgment */}
              <div className="pt-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedPrivacy}
                    onChange={(e) => setAgreedPrivacy(e.target.checked)}
                    className="w-4 h-4 text-emerald rounded border-sand focus:ring-emerald mt-0.5 cursor-pointer"
                  />
                  <span className="text-xs text-charcoal/80 leading-snug">
                    أقر بصحة البيانات وأوافق على الالتزام بالقواعد الكشفية وتوجيهات قادة الفوج.
                  </span>
                </label>
              </div>

              <div className="pt-3">
                <Button
                  variant="adventure"
                  size="lg"
                  type="submit"
                  isLoading={isSubmitting}
                  disabled={isSubmitting}
                  className="w-full"
                >
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
