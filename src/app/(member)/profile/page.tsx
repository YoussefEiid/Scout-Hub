'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  User,
  Phone,
  QrCode,
  Calendar,
  Users,
  Camera,
  CheckCircle2,
  AlertCircle,
  Save,
} from 'lucide-react';
import { TopNavbar } from '@/components/navigation/TopNavbar';
import { BottomMobileNav } from '@/components/navigation/BottomMobileNav';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { getMyProfileAction, updateMyProfileAction } from '@/app/actions/scout-actions';
import { Profile, Team } from '@/types';

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [badges, setBadges] = useState<any[]>([]);
  const [stats, setStats] = useState<{ attended: number; withUniform: number; late: number }>({
    attended: 0,
    withUniform: 0,
    late: 0,
  });
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);

  // Form states
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await getMyProfileAction();
        setProfile(data.profile);
        setQrToken(data.qrToken);
        setStats(data.stats);
        setActiveTeam(data.activeTeam);
        setBadges(data.badges || []);

        if (data.profile) {
          setFullName(data.profile.full_name || '');
          setPhone(data.profile.phone || '');
          setAvatarUrl(data.profile.avatar_url || null);
        }
      } catch (err: any) {
        console.error('Failed to load profile', err);
        setFeedback({ type: 'error', message: err?.message || 'تعذر تحميل بيانات الملف الشخصي' });
      } finally {
        setIsLoading(false);
      }
    }
    loadProfile();
  }, []);

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFeedback({ type: 'error', message: 'صيغة الصورة يجب أن تكون JPG أو PNG أو WebP' });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setFeedback({ type: 'error', message: 'حجم الصورة يجب ألا يتجاوز 2 ميجابايت' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAvatarUrl(reader.result as string);
      setFeedback({ type: 'success', message: 'تم اختيار الصورة. اضغط على حفظ التعديلات لتأكيدها.' });
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFeedback(null);

    try {
      const res = await updateMyProfileAction({
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
        avatar_url: avatarUrl || undefined,
      });

      if (res.success && res.profile) {
        setProfile(res.profile);
        setFeedback({ type: 'success', message: 'تم حفظ بيانات الملف الشخصي بنجاح 🏕️' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'تعذر حفظ التعديلات' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 border-4 border-forest border-t-orange rounded-full animate-spin" />
          <span className="text-xs font-bold text-forest">جاري تحميل الملف الشخصي...</span>
        </div>
      </div>
    );
  }

  const roleLabel =
    profile?.roles?.includes('super_admin')
      ? 'القائد العام'
      : profile?.roles?.includes('section_leader')
      ? 'قائد مرحلة'
      : profile?.roles?.includes('assistant_leader')
      ? 'مساعد قائد'
      : 'كشاف';

  return (
    <div className="min-h-screen flex flex-col bg-cream text-charcoal pb-24 md:pb-12">
      <TopNavbar userName={profile?.full_name} currentRole={profile?.roles?.[0] || 'member'} />

      <main className="max-w-3xl mx-auto w-full px-4 pt-6 space-y-6">
        {/* Profile Header Card */}
        <div className="relative overflow-hidden bg-gradient-to-r from-forest to-forest-hover rounded-3xl p-6 text-cream shadow-md">
          <div className="flex flex-col sm:flex-row items-center gap-5 relative z-10 text-center sm:text-right">
            {/* Avatar with Upload Badge */}
            <div className="relative group">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-sand/40 bg-sand/20 flex items-center justify-center shadow-lg">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={fullName} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-12 h-12 text-sand-light" />
                )}
              </div>
              <label
                htmlFor="avatar-upload"
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-orange text-white flex items-center justify-center shadow-md cursor-pointer hover:bg-orange-hover transition-transform hover:scale-110"
                title="تغيير الصورة الشخصية"
              >
                <Camera className="w-4 h-4" />
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAvatarFile}
                  className="hidden"
                />
              </label>
            </div>

            <div className="flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-sand-light">{profile?.full_name}</h1>
                <Badge variant="orange" size="sm">
                  {roleLabel}
                </Badge>
              </div>

              <div className="text-xs text-cream/80 flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-1">
                <span className="font-mono bg-forest/80 px-2.5 py-0.5 rounded-full border border-sand/20">
                  قيد: {profile?.member_number}
                </span>
                {profile?.section?.name && (
                  <span className="bg-emerald/30 px-2.5 py-0.5 rounded-full border border-emerald/40">
                    {profile.section.name}
                  </span>
                )}
                {profile?.year?.name && (
                  <span className="bg-sand/20 px-2.5 py-0.5 rounded-full border border-sand/30">
                    {profile.year.name}
                  </span>
                )}
              </div>
            </div>

            {/* Quick Digital Card Button */}
            <Link href="/card" className="shrink-0">
              <Button variant="secondary" size="sm" className="flex items-center gap-1.5 shadow-md">
                <QrCode className="w-4 h-4 text-orange" />
                <span>بطاقتي الرقمية</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-2.5 animate-in fade-in duration-300 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Edit Profile Form */}
        <Card className="bg-white rounded-3xl border-sand scout-card-shadow p-6">
          <CardHeader className="p-0 pb-4 border-b border-sand/40 mb-4">
            <CardTitle className="text-base font-bold text-forest flex items-center gap-2">
              <User className="w-5 h-5 text-orange" />
              <span>البيانات الشخصية القابلة للتعديل</span>
            </CardTitle>
          </CardHeader>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-charcoal/80 mb-1">
                الاسم الكامل (الاسم الثلاثي أو الرباعي)
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-sand bg-cream/20 text-sm focus:border-emerald focus:ring-1 focus:ring-emerald outline-none text-right"
                />
                <User className="w-4 h-4 text-charcoal/40 absolute left-3 top-3.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-charcoal/80 mb-1">
                رقم هاتف الطوارئ (اختياري وسري)
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
                سري ومحمي: لا يظهر لباقي الكشافة في الطليعة أو الموقع العام.
              </p>
            </div>

            {/* Read-Only Scout Structure Affiliation */}
            <div className="p-4 rounded-2xl bg-sand/20 border border-sand/60 space-y-2">
              <span className="text-xs font-bold text-forest block">التبعية الكشفية (معتمدة من قيادة الفوج):</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-charcoal/60 block">القسم الكشفي:</span>
                  <span className="font-bold text-forest">
                    {profile?.section?.name || 'غير محدد'}
                  </span>
                </div>
                <div>
                  <span className="text-charcoal/60 block">السنة الكشفية / الفوج:</span>
                  <span className="font-bold text-forest">
                    {profile?.year?.name || 'غير محدد'}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-charcoal/50">
                ملاحظة أمنية: تغيير القسم أو السنة الكشفية يتم حصراً بطلب وموافقة قائد الفوج لضمان سلامة التوزيع والتقارير.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <Button variant="adventure" size="md" type="submit" isLoading={isSaving} className="flex items-center gap-1.5">
                <Save className="w-4 h-4" />
                <span>حفظ التعديلات</span>
              </Button>
            </div>
          </form>
        </Card>

        {/* Attendance Summary Widget */}
        <Card className="bg-white rounded-3xl border-sand scout-card-shadow p-6">
          <CardHeader className="p-0 pb-4 border-b border-sand/40 mb-4 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold text-forest flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald" />
              <span>ملخص حضور اجتماعات الجمعة</span>
            </CardTitle>
            <Link href="/attendance-history" className="text-xs text-emerald font-bold hover:underline">
              عرض السجل الكامل
            </Link>
          </CardHeader>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3.5 rounded-2xl bg-cream/40 border border-sand">
              <span className="text-2xl font-black text-forest block">{stats.attended}</span>
              <span className="text-xs text-charcoal/70">لقاءات حضرتها</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-cream/40 border border-sand">
              <span className="text-2xl font-black text-emerald block">{stats.withUniform}</span>
              <span className="text-xs text-charcoal/70">بالزي الكشفي</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-cream/40 border border-sand">
              <span className="text-2xl font-black text-orange block">{stats.late}</span>
              <span className="text-xs text-charcoal/70">تأخير بعد الطابور</span>
            </div>
          </div>
        </Card>

        {/* Published Team Info */}
        {activeTeam && (
          <Card className="bg-white rounded-3xl border-sand scout-card-shadow p-6">
            <CardHeader className="p-0 pb-4 border-b border-sand/40 mb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-bold text-forest flex items-center gap-2">
                <Users className="w-5 h-5 text-orange" />
                <span>طليعتي الكشفية المعتمدة: {activeTeam.name}</span>
              </CardTitle>
              <Link href="/team" className="text-xs text-emerald font-bold hover:underline">
                تفاصيل الطليعة
              </Link>
            </CardHeader>
            <p className="text-xs text-charcoal/70">
              عدد أفراد الطليعة: {activeTeam.member_count || activeTeam.memberships?.length || 0} كشافين.
            </p>
          </Card>
        )}
      </main>

      <BottomMobileNav currentRole={profile?.roles?.[0] || 'member'} />
    </div>
  );
}
