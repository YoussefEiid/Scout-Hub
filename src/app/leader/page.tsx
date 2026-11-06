'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Compass,
  QrCode,
  Users,
  BarChart3,
  Calendar,
  Layers,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getLeaderDashboardDataAction } from '@/app/actions/scout-actions';
import { Profile, FridaySession, StaffScopeAssignment, ScoutSection } from '@/types';

export default function LeaderDashboardPage() {
  const [scopes, setScopes] = useState<StaffScopeAssignment[]>([]);
  const [allSections, setAllSections] = useState<ScoutSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [activeSession, setActiveSession] = useState<FridaySession | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [attendanceCount, setAttendanceCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const data = await getLeaderDashboardDataAction();
        setScopes(data.scopes);
        setAllSections(data.allSections);
        setActiveSession(data.activeSession);
        setMembers(data.members);
        setAttendanceCount(data.attendanceCount);

        if (data.scopes && data.scopes.length > 0) {
          setSelectedSectionId(data.scopes[0].section_id);
          setSelectedYearId(data.scopes[0].year_id || '');
        } else if (data.allSections && data.allSections.length > 0) {
          setSelectedSectionId(data.allSections[0].id);
        }
      } catch (err) {
        console.error('Failed to load leader dashboard', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const handleScopeChange = async (sectionId: string, yearId: string) => {
    setSelectedSectionId(sectionId);
    setSelectedYearId(yearId);
    setIsLoading(true);
    try {
      const data = await getLeaderDashboardDataAction(sectionId || undefined, yearId || undefined);
      setMembers(data.members);
      setAttendanceCount(data.attendanceCount);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const currentSection = allSections.find((s) => s.id === selectedSectionId);

  return (
    <div className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
      {/* Leader Header Card */}
      <div className="bg-gradient-to-r from-forest to-emerald-dark rounded-3xl p-6 text-cream shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange/20 border border-orange/40 text-sand-light text-xs font-bold mb-2">
              <ShieldCheck className="w-3.5 h-3.5 text-orange" />
              <span>لوحة قيادة المرحلة الكشفية المصرح بها</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-sand-light">
              قيادة {currentSection?.name || 'القسم الكشفي'} 🏕️
            </h1>
            <p className="text-xs text-cream/80 mt-1">
              متابعة الأعضاء وتسجيل حضور الجمعة وتوزيع الطلائع الخاصة بنطاقك المعتمد
            </p>
          </div>

          <Link href="/leader/scanner">
            <Button variant="adventure" size="md" className="shadow-lg flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              <span>فتح ماسح حضور الجمعة</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Scope Selector Bar (When Leader has multiple scopes) */}
      <div className="bg-white p-4 rounded-3xl border border-sand scout-card-shadow flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-orange" />
          <span className="text-xs font-bold text-forest">نطاق الإشراف النشط:</span>
        </div>

        {scopes.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {scopes.map((sc) => {
              const isSelected =
                sc.section_id === selectedSectionId && (sc.year_id || '') === selectedYearId;
              return (
                <button
                  key={sc.id}
                  onClick={() => handleScopeChange(sc.section_id, sc.year_id || '')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    isSelected
                      ? 'bg-forest text-sand-light border-forest shadow-sm'
                      : 'bg-cream/40 text-charcoal/70 border-sand hover:bg-cream'
                  }`}
                >
                  {sc.section?.name || 'قسم'} {sc.year?.name ? `(${sc.year.name})` : '(كل السنوات)'}
                </button>
              );
            })}
          </div>
        ) : (
          <span className="text-xs font-bold text-forest bg-sand/30 px-3 py-1 rounded-full">
            {currentSection?.name || 'القسم المخصص'}
          </span>
        )}
      </div>

      {/* KPIs Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-sand scout-card-shadow text-center">
          <span className="text-3xl font-black text-forest block">{members.length}</span>
          <span className="text-xs font-bold text-charcoal/70">كشافين في نطاقك</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-sand scout-card-shadow text-center">
          <span className="text-3xl font-black text-emerald block">{attendanceCount}</span>
          <span className="text-xs font-bold text-charcoal/70">حضور اجتماع اليوم</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-sand scout-card-shadow text-center col-span-2 sm:col-span-1">
          <span className="text-3xl font-black text-orange block">
            {activeSession?.is_open_for_attendance ? 'مفتوح' : 'مغلق'}
          </span>
          <span className="text-xs font-bold text-charcoal/70">حالة طابور الجمعة</span>
        </div>
      </div>

      {/* Quick Action Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/leader/scanner" className="group">
          <div className="bg-white p-5 rounded-3xl border border-sand scout-card-shadow hover:border-orange transition-all h-full flex flex-col justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-orange/15 text-orange flex items-center justify-center">
                <QrCode className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-forest group-hover:text-orange transition-colors">
                  ماسح حضور الجمعة
                </h3>
                <p className="text-xs text-charcoal/65 mt-0.5">
                  تحضير فوري عبر كاميرا الهاتف مع فحص الزي الكشفي والتأخير
                </p>
              </div>
            </div>
            <div className="pt-3 flex items-center text-xs font-bold text-orange">
              <span>بدء المسح الآن</span>
              <ArrowLeft className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" />
            </div>
          </div>
        </Link>

        <Link href="/leader/members" className="group">
          <div className="bg-white p-5 rounded-3xl border border-sand scout-card-shadow hover:border-forest transition-all h-full flex flex-col justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-forest/10 text-forest flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-forest group-hover:text-forest-hover transition-colors">
                  كشافين القسم المصرح بهم
                </h3>
                <p className="text-xs text-charcoal/65 mt-0.5">
                  قائمة الأعضاء التابعين لنطاقك وحالات الالتزام وأرقام القيد
                </p>
              </div>
            </div>
            <div className="pt-3 flex items-center text-xs font-bold text-forest">
              <span>استعراض الكشافين ({members.length})</span>
              <ArrowLeft className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" />
            </div>
          </div>
        </Link>

        <Link href="/leader/teams" className="group">
          <div className="bg-white p-5 rounded-3xl border border-sand scout-card-shadow hover:border-emerald transition-all h-full flex flex-col justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald/10 text-emerald flex items-center justify-center">
                <Compass className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-forest group-hover:text-emerald transition-colors">
                  فرق وطلائع القسم
                </h3>
                <p className="text-xs text-charcoal/65 mt-0.5">
                  توزيع طلائع القسم واعتماد ونشر التشكيل الداخلي
                </p>
              </div>
            </div>
            <div className="pt-3 flex items-center text-xs font-bold text-emerald">
              <span>إدارة وتوزيع الفرق</span>
              <ArrowLeft className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" />
            </div>
          </div>
        </Link>

        <Link href="/leader/reports" className="group">
          <div className="bg-white p-5 rounded-3xl border border-sand scout-card-shadow hover:border-blue-600 transition-all h-full flex flex-col justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-forest group-hover:text-blue-600 transition-colors">
                  تقارير الحضور وتصدير Excel
                </h3>
                <p className="text-xs text-charcoal/65 mt-0.5">
                  إحصائيات اجتماعات الجمعة ونسب التزام الزي لطليعتك وقسمك
                </p>
              </div>
            </div>
            <div className="pt-3 flex items-center text-xs font-bold text-blue-600">
              <span>عرض وتصدير التقارير</span>
              <ArrowLeft className="w-4 h-4 mr-1 group-hover:-translate-x-1 transition-transform" />
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
