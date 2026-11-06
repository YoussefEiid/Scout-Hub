'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Download,
  Users,
  Shirt,
  Clock,
  CheckCircle2,
  FileSpreadsheet,
  ArrowRight,
  Calendar,
} from 'lucide-react';
import { FridaySession, AttendanceRecord } from '@/types';
import { exportAttendanceCSVAction, getAdminReportsDataAction } from '@/app/actions/scout-actions';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function SuperAdminAttendancePage() {
  const [sessions, setSessions] = useState<FridaySession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    async function loadReports() {
      try {
        const data = await getAdminReportsDataAction();
        setSessions(data.sessions);
        setSelectedSessionId(data.selectedSessionId);
        setRecords(data.records);
      } catch (err) {
        console.error('Failed to load reports', err);
      }
    }
    loadReports();
  }, []);

  const loadRecords = async (sessId: string) => {
    try {
      const data = await getAdminReportsDataAction(sessId);
      setRecords(data.records);
    } catch (err) {
      console.error('Failed to load session records', err);
    }
  };

  const handleSessionChange = (id: string) => {
    setSelectedSessionId(id);
    loadRecords(id);
  };

  const handleExportCSV = async () => {
    if (!selectedSessionId) return;
    setIsExporting(true);
    try {
      const csvContent = await exportAttendanceCSVAction(selectedSessionId);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `scout-attendance-${selectedSessionId}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('حدث خطأ أثناء تصدير التقرير');
    } finally {
      setIsExporting(false);
    }
  };

  const totalAttendees = records.length;
  const uniformAttendees = records.filter((r) => r.uniform_status === 'with_uniform').length;
  const onTimeAttendees = records.filter((r) => r.arrival_status === 'on_time').length;
  const lateAttendees = records.filter((r) => r.arrival_status === 'late').length;

  return (
    <div className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/super-admin" className="text-xs text-charcoal/60 hover:text-forest flex items-center gap-1 font-bold">
              <span>لوحة الإدارة العامة</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <span className="text-xs text-charcoal/40">/</span>
            <span className="text-xs font-bold text-forest">تقارير واجتماعات الجمعة</span>
          </div>
          <h1 className="text-2xl font-black text-forest">إدارة الحضور واجتماعات الجمعة 🏕️</h1>
          <p className="text-xs text-charcoal/70">
            استعراض سجلات الحضور الشاملة للفوج وتصدير ملفات Excel المتوافقة مع اللغة العربية
          </p>
        </div>

        <Button
          variant="adventure"
          size="sm"
          onClick={handleExportCSV}
          isLoading={isExporting}
          disabled={records.length === 0}
          className="flex items-center gap-2 shadow-md"
        >
          <Download className="w-4 h-4" />
          <span>تصدير Excel / CSV (عربي)</span>
        </Button>
      </div>

      {/* Session Selector & KPIs */}
      <div className="bg-white p-5 rounded-3xl border border-sand scout-card-shadow flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="w-full md:w-auto flex items-center gap-3">
          <Calendar className="w-5 h-5 text-forest" />
          <span className="text-xs font-bold text-forest whitespace-nowrap">اختر اجتماع الجمعة:</span>
          <select
            value={selectedSessionId}
            onChange={(e) => handleSessionChange(e.target.value)}
            className="w-full md:w-72 px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs font-bold text-forest outline-none"
          >
            {sessions.map((sess) => (
              <option key={sess.id} value={sess.id}>
                {sess.title} ({sess.session_date})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-4 gap-2 w-full md:w-auto text-center">
          <div className="bg-forest/5 p-2.5 rounded-2xl border border-forest/10 min-w-[70px]">
            <span className="text-lg font-black text-forest block">{totalAttendees}</span>
            <span className="text-[10px] text-charcoal/60">حضور</span>
          </div>
          <div className="bg-emerald/10 p-2.5 rounded-2xl border border-emerald/20 min-w-[70px]">
            <span className="text-lg font-black text-emerald block">{uniformAttendees}</span>
            <span className="text-[10px] text-charcoal/60">بالزي</span>
          </div>
          <div className="bg-sand/30 p-2.5 rounded-2xl border border-sand min-w-[70px]">
            <span className="text-lg font-black text-forest block">{onTimeAttendees}</span>
            <span className="text-[10px] text-charcoal/60">طابور مبكر</span>
          </div>
          <div className="bg-orange/10 p-2.5 rounded-2xl border border-orange/20 min-w-[70px]">
            <span className="text-lg font-black text-orange block">{lateAttendees}</span>
            <span className="text-[10px] text-charcoal/60">تأخير</span>
          </div>
        </div>
      </div>

      {/* Attendance Records Table */}
      <Card className="bg-white rounded-3xl border-sand scout-card-shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-sand/30 text-forest font-bold border-b border-sand/60">
              <tr>
                <th className="py-3 px-4">رقم القيد</th>
                <th className="py-3 px-4">اسم الكشاف</th>
                <th className="py-3 px-4">وقت التسجيل</th>
                <th className="py-3 px-4">طريقة التحضير</th>
                <th className="py-3 px-4">الزي الكشفي</th>
                <th className="py-3 px-4">التوقيت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand/40">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-charcoal/50">
                    لا توجد سجلات حضور مسجلة لهذا الاجتماع
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="hover:bg-cream/20 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-forest">
                      {r.member?.member_number || '---'}
                    </td>
                    <td className="py-3 px-4 font-bold text-forest">
                      {r.member?.full_name || 'كشاف غير مسجل'}
                    </td>
                    <td className="py-3 px-4 text-charcoal/70 font-mono">
                      {new Date(r.recorded_at).toLocaleTimeString('ar-EG')}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] bg-sand/30 px-2 py-0.5 rounded-full font-bold">
                        {r.is_manual ? 'يدوي (سبب)' : 'ماسح QR'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={r.uniform_status === 'with_uniform' ? 'emerald' : 'neutral'} size="sm">
                        {r.uniform_status === 'with_uniform' ? 'بالزي الكشفي' : 'بدون زي'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={r.arrival_status === 'on_time' ? 'emerald' : 'orange'} size="sm">
                        {r.arrival_status === 'on_time' ? 'مبكر' : 'متأخر'}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
