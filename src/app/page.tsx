import React from 'react';
import Link from 'next/link';
import {
  Compass,
  QrCode,
  Users,
  Award,
  Calendar,
  ArrowLeft,
  Flame,
  ShieldCheck,
  User,
  Layers,
  Sparkles,
} from 'lucide-react';
import { TopNavbar } from '@/components/navigation/TopNavbar';
import { BottomMobileNav } from '@/components/navigation/BottomMobileNav';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getCurrentSession, getDefaultRedirectForRole } from '@/lib/auth/auth-service';
import { isDemoModeEnabled } from '@/lib/config/runtime';

export const instant = false;

export default async function HomePage() {
  const session = await getCurrentSession();
  const isDemo = isDemoModeEnabled();

  const userRole = session?.roles?.[0] || 'guest';
  const userName = session?.profile?.full_name || session?.email?.split('@')[0];
  const isLoggedIn = Boolean(session?.userId);

  const isSuperAdmin = session?.roles?.includes('super_admin');
  const isLeader =
    session?.roles?.includes('section_leader') ||
    session?.roles?.includes('assistant_leader') ||
    session?.roles?.includes('admin') ||
    session?.roles?.includes('attendance_leader');

  const dashboardHref = session ? getDefaultRedirectForRole(session.roles) : '/dashboard';

  return (
    <div className="min-h-screen flex flex-col bg-cream text-charcoal">
      <TopNavbar currentRole={userRole} userName={userName} />

      <main className="flex-1 pb-20 md:pb-12">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-forest via-forest to-emerald-dark text-cream pt-12 pb-20 px-4 sm:px-6">
          {/* Ambient Glow Accents */}
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-orange/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-10 w-80 h-80 bg-emerald/20 rounded-full blur-3xl pointer-events-none" />

          <div className="max-w-4xl mx-auto text-center relative z-10 space-y-6">
            {isLoggedIn ? (
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald/20 border border-emerald/40 text-sand-light text-xs sm:text-sm font-bold backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-500">
                <ShieldCheck className="w-4 h-4 text-emerald-light" />
                <span>
                  مرحباً بك مجدداً، {userName} (
                  {isSuperAdmin ? 'القائد العام' : isLeader ? 'قائد مرحلة كشفية' : 'كشاف'})
                </span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange/20 border border-orange/40 text-sand-light text-xs sm:text-sm font-bold backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-500">
                <Flame className="w-4 h-4 text-orange fill-orange" />
                <span>جاهز لمغامرة كشفية جديدة؟</span>
              </div>
            )}

            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-sand-light tracking-tight leading-tight">
              كشافة هب <span className="text-orange">🏕️</span>
              <br />
              <span className="text-white text-2xl sm:text-4xl md:text-5xl font-extrabold">
                المنصة الذكية للمجموعات الكشفية
              </span>
            </h1>

            <p className="text-sm sm:text-base md:text-lg text-cream/80 max-w-2xl mx-auto leading-relaxed">
              بطاقة هوية رقمية لكل كشاف، تسجيل حضور الجمعة بلمح البصر عبر الـ QR، وتوزيع متوازن وعادل للفرق
              والطلائع الكشفية مع أوسمة وشارات تحفيزية.
            </p>

            {/* Authenticated vs Guest Action Controls */}
            {isLoggedIn ? (
              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-lg mx-auto">
                <Link href={dashboardHref} className="w-full sm:w-auto">
                  <Button variant="adventure" size="lg" className="w-full shadow-xl flex items-center justify-center gap-2">
                    {isSuperAdmin ? (
                      <>
                        <Layers className="w-5 h-5" />
                        <span>لوحة الإدارة العامة</span>
                      </>
                    ) : isLeader ? (
                      <>
                        <Compass className="w-5 h-5" />
                        <span>لوحة قيادة القسم</span>
                      </>
                    ) : (
                      <>
                        <Compass className="w-5 h-5" />
                        <span>الذهاب إلى لوحتي</span>
                      </>
                    )}
                    <ArrowLeft className="w-5 h-5 mr-1" />
                  </Button>
                </Link>

                {!isSuperAdmin && !isLeader && (
                  <Link href="/card" className="w-full sm:w-auto">
                    <Button variant="outline" size="lg" className="w-full border-sand text-sand hover:bg-sand/10 flex items-center justify-center gap-2">
                      <QrCode className="w-5 h-5 text-orange" />
                      <span>بطاقتي الرقمية</span>
                    </Button>
                  </Link>
                )}

                {isLeader && (
                  <Link href="/leader/scanner" className="w-full sm:w-auto">
                    <Button variant="outline" size="lg" className="w-full border-sand text-sand hover:bg-sand/10 flex items-center justify-center gap-2">
                      <QrCode className="w-5 h-5 text-orange" />
                      <span>ماسح حضور الجمعة</span>
                    </Button>
                  </Link>
                )}

                <Link href="/profile" className="w-full sm:w-auto">
                  <Button variant="ghost" size="lg" className="w-full text-cream hover:bg-forest-hover flex items-center justify-center gap-2">
                    <User className="w-5 h-5" />
                    <span>الملف الشخصي</span>
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
                <Link href="/register" className="w-full sm:w-auto">
                  <Button variant="adventure" size="lg" className="w-full shadow-xl">
                    <span>انضم كفرد كشفي جديد</span>
                    <ArrowLeft className="w-5 h-5 mr-1" />
                  </Button>
                </Link>
                <Link href="/login" className="w-full sm:w-auto">
                  <Button variant="outline" size="lg" className="w-full border-sand text-sand hover:bg-sand/10">
                    <span>تسجيل دخول الأعضاء</span>
                  </Button>
                </Link>
              </div>
            )}

            {/* Quick Feature Highlights Pill */}
            <div className="pt-8 grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-w-2xl mx-auto text-xs text-cream/90 font-semibold">
              <div className="bg-forest-hover/70 p-2.5 rounded-xl border border-sand/20 flex items-center justify-center gap-1.5">
                <QrCode className="w-4 h-4 text-orange" />
                <span>بطاقة QR مشفرة</span>
              </div>
              <div className="bg-forest-hover/70 p-2.5 rounded-xl border border-sand/20 flex items-center justify-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-light" />
                <span>توزيع متوازن للفرق</span>
              </div>
              <div className="bg-forest-hover/70 p-2.5 rounded-xl border border-sand/20 flex items-center justify-center gap-1.5">
                <Calendar className="w-4 h-4 text-sand" />
                <span>حضور الجمعة والزي</span>
              </div>
              <div className="bg-forest-hover/70 p-2.5 rounded-xl border border-sand/20 flex items-center justify-center gap-1.5">
                <Award className="w-4 h-4 text-orange" />
                <span>أوسمة وتحديات</span>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="py-14 px-4 sm:px-6 max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <Badge variant="emerald" size="sm" className="mb-2">
              خطوات سريعة
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-forest">كيف تعمل منصة كشافة هب؟</h2>
            <p className="text-xs sm:text-sm text-charcoal/70 mt-1">تجربة كشفية عصرية وسلسة من هاتفك المحمول</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-sand scout-card-shadow flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald/10 text-emerald flex items-center justify-center mb-4">
                <QrCode className="w-7 h-7" />
              </div>
              <span className="text-xs font-black text-orange mb-1">الخطوة الأولى</span>
              <h3 className="text-base font-bold text-forest mb-2">بطاقتك الكشفية الرقمية</h3>
              <p className="text-xs text-charcoal/70 leading-relaxed">
                كل كشاف بيحصل على بطاقة رقمية بـ QR كود مشفر وغير قابل للتخمين. تقدر تعرضها على الموبايل أو تطبعها.
              </p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-sand scout-card-shadow flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-orange/15 text-orange flex items-center justify-center mb-4">
                <Calendar className="w-7 h-7" />
              </div>
              <span className="text-xs font-black text-orange mb-1">الخطوة الثانية</span>
              <h3 className="text-base font-bold text-forest mb-2">اجتماع الجمعة والزي</h3>
              <p className="text-xs text-charcoal/70 leading-relaxed">
                أكد حضورك المسبق أسبوعيًا، وفي طابور الصباح القائد بيمسح بطاقتك ويسجل التزامك بالزي الكشفي وتوقيت الحضور.
              </p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-sand scout-card-shadow flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-forest/10 text-forest flex items-center justify-center mb-4">
                <Users className="w-7 h-7" />
              </div>
              <span className="text-xs font-black text-orange mb-1">الخطوة الثالثة</span>
              <h3 className="text-base font-bold text-forest mb-2">طليعتك ومغامراتك</h3>
              <p className="text-xs text-charcoal/70 leading-relaxed">
                اكتشف فريقك فور نشره من القادة، وتعرف على زملائك في الطليعة واجمع النقاط والأوسمة الكشفية.
              </p>
            </div>
          </div>
        </section>

        {/* Local Demo navigation is strictly restricted to development only */}
        {isDemo && (
          <section className="py-6 px-4 sm:px-6 max-w-xl mx-auto">
            <div className="bg-sand/40 border border-sand rounded-2xl p-4 text-center space-y-2">
              <h4 className="text-xs font-bold text-forest flex items-center justify-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-orange" />
                <span>وضع المعاينة المحلي (Local Dev Preview)</span>
              </h4>
              <p className="text-[11px] text-charcoal/70">
                هذا المربع مخصص للتطوير المحلي فقط ويتم إخفاؤه تلقائياً في بيئة الإنتاج السحابية.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <Link href="/dashboard">
                  <Button variant="primary" size="sm" className="text-xs">
                    لوحة الكشاف
                  </Button>
                </Link>
                <Link href="/card">
                  <Button variant="outline" size="sm" className="text-xs bg-white">
                    البطاقة الرقمية
                  </Button>
                </Link>
                <Link href="/profile">
                  <Button variant="outline" size="sm" className="text-xs bg-white">
                    الملف الشخصي
                  </Button>
                </Link>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-forest text-cream/70 py-8 px-4 border-t border-forest-hover text-center text-xs space-y-2 no-print">
        <div className="flex items-center justify-center gap-2 text-sand-light font-bold">
          <Compass className="w-4 h-4 text-orange" />
          <span>كشافة هب — Scout Hub Platform</span>
        </div>
        <p className="text-[11px] text-cream/50">
          منصة مصممة بأعلى معايير الأمان وحماية خصوصية الكشافة والأشبال. جميع الحقوق محفوظة © 2026.
        </p>
      </footer>

      <BottomMobileNav currentRole={userRole} />
    </div>
  );
}
