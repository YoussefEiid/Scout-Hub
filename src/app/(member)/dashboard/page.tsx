'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Compass,
  QrCode,
  Users,
  Award,
  CheckCircle2,
  Shirt,
  Sparkles,
  ArrowLeft,
  Flame,
} from 'lucide-react';
import { TopNavbar } from '@/components/navigation/TopNavbar';
import { BottomMobileNav } from '@/components/navigation/BottomMobileNav';
import { Profile, FridaySession, WeeklyResponse, WeeklyResponseType } from '@/types';
import { FridayAttendanceWidget } from '@/components/scout/FridayAttendanceWidget';
import { submitWeeklyResponseAction, getDashboardDataAction } from '@/app/actions/scout-actions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function MemberDashboardPage() {
  const [member, setMember] = useState<Profile | null>(null);
  const [activeSession, setActiveSession] = useState<FridaySession | null>(null);
  const [weeklyResponse, setWeeklyResponse] = useState<WeeklyResponse | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    async function loadData() {
      const data = await getDashboardDataAction();
      setMember(data.member);
      setActiveSession(data.activeSession);
      setWeeklyResponse(data.weeklyResponse);
      setIsDemoMode(!data.isLiveSupabase);
    }
    loadData();
  }, []);

  const handleSubmitResponse = async (resp: WeeklyResponseType) => {
    if (!activeSession || !member) throw new Error('بيانات غير مكتملة');
    const updated = await submitWeeklyResponseAction(activeSession.id, member.id, resp);
    setWeeklyResponse(updated);
    return updated;
  };

  if (!member) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-4">
        <div className="text-center">
          <Compass className="w-10 h-10 text-orange animate-spin mx-auto mb-2" />
          <p className="text-sm font-bold text-forest">جاري تحميل لوحتك الكشفية...</p>
        </div>
      </div>
    );
  }

  const stageNames: Record<string, string> = {
    stage_1: 'الأشبال والزهرات',
    stage_2: 'الفتيان والمرشدات',
    stage_3: 'المتقدم والرائدات',
  };

  return (
    <div className="min-h-screen flex flex-col bg-cream text-charcoal pb-24 md:pb-12">
      <TopNavbar currentRole={member.roles?.[0]} userName={member.full_name} />

      {/* Dev Mode Banner */}
      {isDemoMode && (
        <div className="bg-sand border-b border-sand-light px-4 py-1.5 text-center text-xs font-bold text-forest">
          <span>وضع العرض التجريبي المتكامل (Demo Mode) — 60 كشافاً مسجلين، حضور الجمعة وتوزيع الفرق جاهزة!</span>
        </div>
      )}

      <main className="max-w-4xl mx-auto w-full px-4 pt-6 space-y-6">
        {/* Welcome Hero Banner */}
        <div className="rounded-3xl bg-gradient-to-r from-forest to-emerald text-cream p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-44 h-44 bg-orange/20 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange/20 text-orange text-xs font-bold border border-orange/30">
              <Flame className="w-3.5 h-3.5 fill-orange" />
              <span>مستعد لمغامرة الجمعة القادمة؟</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white">
              أهلاً يا {member.full_name.split(' ')[0]}! 🏕️
            </h1>

            <p className="text-xs sm:text-sm text-sand leading-relaxed">
              رقم قيدك الكشفي: <strong className="font-mono text-white">{member.member_number}</strong> — مرحلة{' '}
              <strong>{stageNames[member.stage_id]}</strong>
            </p>

            <div className="pt-2 flex items-center gap-2 flex-wrap">
              <Link href="/card">
                <Button variant="adventure" size="sm" className="shadow-md">
                  <QrCode className="w-4 h-4 ml-1" />
                  <span>عرض بطاقتي الكشفية</span>
                </Button>
              </Link>
              <Link href="/team">
                <Button variant="outline" size="sm" className="border-sand text-sand hover:bg-sand/10">
                  <Users className="w-4 h-4 ml-1" />
                  <span>طليعتي الكشفية</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Attendance Statistics Strip */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="text-center p-3 bg-white/95">
            <div className="w-8 h-8 rounded-lg bg-emerald/10 text-emerald flex items-center justify-center mx-auto mb-1">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="text-lg font-black text-forest">12</div>
            <div className="text-[10px] text-charcoal/60 font-medium">اجتماعات حضرتها</div>
          </Card>

          <Card className="text-center p-3 bg-white/95">
            <div className="w-8 h-8 rounded-lg bg-forest/10 text-forest flex items-center justify-center mx-auto mb-1">
              <Shirt className="w-4 h-4" />
            </div>
            <div className="text-lg font-black text-forest">100%</div>
            <div className="text-[10px] text-charcoal/60 font-medium">التزام بالزي الكامل</div>
          </Card>

          <Card className="text-center p-3 bg-white/95">
            <div className="w-8 h-8 rounded-lg bg-orange/15 text-orange flex items-center justify-center mx-auto mb-1">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="text-lg font-black text-orange">85</div>
            <div className="text-[10px] text-charcoal/60 font-medium">نقطة كشفية</div>
          </Card>
        </div>

        {/* Friday RSVP Meeting Widget */}
        {activeSession && (
          <FridayAttendanceWidget
            session={activeSession}
            initialResponse={weeklyResponse}
            onSubmitResponse={handleSubmitResponse}
          />
        )}

        {/* Team Assignment Teaser */}
        <Card className="bg-white/95">
          <CardHeader className="border-b border-sand/30 pb-3">
            <CardTitle className="text-base text-forest flex items-center gap-2">
              <Users className="w-5 h-5 text-orange" />
              <span>فريقك الكشفي (الطليعة)</span>
            </CardTitle>
            <Link href="/team" className="text-xs text-emerald font-bold hover:underline flex items-center gap-1">
              <span>عرض الطليعة</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="pt-3">
            {member.active_team ? (
              <div className="flex items-center justify-between p-3 rounded-2xl bg-sand/30 border border-sand">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-forest text-cream flex items-center justify-center text-lg">
                    🏕️
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-forest">{member.active_team.name}</h4>
                    <p className="text-xs text-charcoal/60">
                      إجمالي الأعضاء: {member.active_team.member_count || 12} كشافاً
                    </p>
                  </div>
                </div>
                <Badge variant="orange" size="sm">
                  طليعتك المعتمدة
                </Badge>
              </div>
            ) : (
              <p className="text-xs text-charcoal/60 py-2">
                الفرق لسه بتتجهز... استعد للمغامرة! سيظهر اسم طليعتك هنا فور نشرها.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Gamification Badges */}
        <Card className="bg-white/95">
          <CardHeader className="border-b border-sand/30 pb-3">
            <CardTitle className="text-base text-forest flex items-center gap-2">
              <Award className="w-5 h-5 text-emerald" />
              <span>الأوسمة والشارات المكتسبة</span>
            </CardTitle>
            <Badge variant="emerald" size="sm">
              3 أوسمة
            </Badge>
          </CardHeader>
          <CardContent className="pt-3">
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-cream/40 p-3 rounded-2xl border border-sand/60 text-center flex flex-col items-center">
                <div className="w-10 h-10 rounded-full bg-emerald/10 text-emerald flex items-center justify-center mb-1 text-lg">
                  🧭
                </div>
                <span className="text-xs font-bold text-forest">أول حضور</span>
                <span className="text-[10px] text-charcoal/50">+15 نقطة</span>
              </div>

              <div className="bg-cream/40 p-3 rounded-2xl border border-sand/60 text-center flex flex-col items-center">
                <div className="w-10 h-10 rounded-full bg-orange/15 text-orange flex items-center justify-center mb-1 text-lg">
                  🔥
                </div>
                <span className="text-xs font-bold text-forest">٣ جمع متتالية</span>
                <span className="text-[10px] text-charcoal/50">+30 نقطة</span>
              </div>

              <div className="bg-cream/40 p-3 rounded-2xl border border-sand/60 text-center flex flex-col items-center">
                <div className="w-10 h-10 rounded-full bg-forest/10 text-forest flex items-center justify-center mb-1 text-lg">
                  👔
                </div>
                <span className="text-xs font-bold text-forest">ملتزم بالزي</span>
                <span className="text-[10px] text-charcoal/50">+25 نقطة</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <BottomMobileNav currentRole={member.roles?.[0]} />
    </div>
  );
}
