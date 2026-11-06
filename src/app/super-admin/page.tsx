import React from 'react';
import Link from 'next/link';
import {
  Layers,
  Users,
  Compass,
  Calendar,
  ShieldCheck,
  UserCheck,
  BarChart3,
  ArrowLeft,
  Flame,
  FileSpreadsheet,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getSuperAdminOverviewAction } from '@/app/actions/scout-actions';

export default async function SuperAdminOverviewPage() {
  const data = await getSuperAdminOverviewAction();

  const cards = [
    {
      title: 'الهيكل الكشفي والأقسام',
      desc: 'إدارة وتخصيص الأقسام الكشفية وسنوات كل مرحلة وترتيبها وحالتها',
      href: '/super-admin/sections',
      icon: Compass,
      color: 'bg-emerald text-emerald',
      count: `${data.totalSections} أقسام معتمدة`,
    },
    {
      title: 'حسابات القادة والصلاحيات',
      desc: 'إنشاء حسابات قادة المراحل والمساعدين وتعيين نطاقات الإشراف بالقسم والسنة',
      href: '/super-admin/leaders',
      icon: UserCheck,
      color: 'bg-orange text-orange',
      count: `${data.totalLeaders} قادة مكلفين`,
    },
    {
      title: 'سجل جميع الأعضاء',
      desc: 'استعراض وبحث وفلترة كافة الكشافة والأشبال عبر جميع الأقسام',
      href: '/super-admin/members',
      icon: Users,
      color: 'bg-blue-600 text-blue-600',
      count: `${data.totalMembers} كشاف مسجل`,
    },
    {
      title: 'إدارة الحضور واجتماعات الجمعة',
      desc: 'جدولة ومتابعة طوابير الجمعة وتقارير الحضور الشاملة للفوج',
      href: '/super-admin/attendance',
      icon: Calendar,
      color: 'bg-purple-600 text-purple-600',
      count: `${data.totalSessions} جلسات مسجلة`,
    },
    {
      title: 'محرك توزيع الفرق والطلائع',
      desc: 'توزيع الفرق والطلائع الكشفية ونشر التشكيلات المعتمدة',
      href: '/super-admin/teams',
      icon: Layers,
      color: 'bg-forest text-forest',
      count: 'توزيعات الفرق',
    },
    {
      title: 'سجل التدقيق الأمني',
      desc: 'مراقبة ومراجعة كافة العمليات الحساسة وتعديلات الصلاحيات والحضور',
      href: '/super-admin/audit',
      icon: ShieldCheck,
      color: 'bg-red-600 text-red-600',
      count: 'الأمان والرقابة',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
      {/* Overview Header Banner */}
      <div className="bg-forest text-cream rounded-3xl p-6 shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-600/30 border border-red-500/40 text-sand-light text-xs font-bold mb-2">
              <ShieldCheck className="w-3.5 h-3.5 text-red-400" />
              <span>لوحة الإدارة العامة — Super Admin Dashboard</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-sand-light">التحكم المركزي بفوج كشافة هب 🏕️</h1>
            <p className="text-xs md:text-sm text-cream/75 mt-1 max-w-2xl">
              إدارة الهيكل الكشفي الديناميكي، تكليف القادة بنطاقات إشراف محددة، والرقابة الشاملة على الحضور والفرق.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/super-admin/leaders">
              <Button variant="adventure" size="sm" className="shadow-lg flex items-center gap-1.5">
                <UserCheck className="w-4 h-4" />
                <span>إضافة قائد جديد</span>
              </Button>
            </Link>
            <Link href="/super-admin/sections">
              <Button variant="outline" size="sm" className="border-sand text-sand hover:bg-sand/10">
                <span>إضافة قسم كشفي</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-sand scout-card-shadow text-center">
          <span className="text-3xl font-black text-forest block">{data.totalMembers}</span>
          <span className="text-xs font-bold text-charcoal/70">إجمالي الأعضاء</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-sand scout-card-shadow text-center">
          <span className="text-3xl font-black text-orange block">{data.totalLeaders}</span>
          <span className="text-xs font-bold text-charcoal/70">قادة المراحل</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-sand scout-card-shadow text-center">
          <span className="text-3xl font-black text-emerald block">{data.totalSections}</span>
          <span className="text-xs font-bold text-charcoal/70">أقسام كشفية نشطة</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-sand scout-card-shadow text-center">
          <span className="text-3xl font-black text-blue-600 block">{data.totalSessions}</span>
          <span className="text-xs font-bold text-charcoal/70">اجتماعات جمعة</span>
        </div>
      </div>

      {/* Management Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href} className="group">
              <div className="bg-white p-5 rounded-3xl border border-sand scout-card-shadow hover:border-forest/40 transition-all h-full flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-cream flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Icon className="w-6 h-6 text-forest" />
                    </div>
                    <Badge variant="neutral" size="sm">
                      {card.count}
                    </Badge>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-forest group-hover:text-orange transition-colors">
                      {card.title}
                    </h3>
                    <p className="text-xs text-charcoal/70 mt-1 leading-relaxed">{card.desc}</p>
                  </div>
                </div>

                <div className="pt-4 flex items-center text-xs font-bold text-forest group-hover:text-orange transition-colors">
                  <span>فتح إدارة الوحدة</span>
                  <ArrowLeft className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Recent Audit Logs Feed */}
      <Card className="bg-white rounded-3xl border-sand scout-card-shadow p-6">
        <CardHeader className="p-0 pb-4 border-b border-sand/40 mb-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-bold text-forest flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-red-600" />
            <span>آخر العمليات والأحداث الحساسة (Audit Trail)</span>
          </CardTitle>
          <Link href="/super-admin/audit" className="text-xs text-emerald font-bold hover:underline">
            عرض كل السجلات
          </Link>
        </CardHeader>

        {data.recentAuditLogs.length === 0 ? (
          <p className="text-xs text-charcoal/60 text-center py-4">لا توجد عمليات مسجلة حديثاً</p>
        ) : (
          <div className="divide-y divide-sand/40">
            {data.recentAuditLogs.slice(0, 5).map((log: any) => (
              <div key={log.id} className="py-2.5 flex items-center justify-between text-xs">
                <div className="space-y-0.5">
                  <span className="font-bold text-forest block">{log.action}</span>
                  <span className="text-[11px] text-charcoal/60">
                    بواسطة: {log.profiles?.full_name || 'النظام'} • جدول: {log.entity_type}
                  </span>
                </div>
                <span className="text-[10px] text-charcoal/50 font-mono">
                  {new Date(log.created_at).toLocaleTimeString('ar-EG')}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
