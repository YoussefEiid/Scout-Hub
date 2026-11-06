'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Download, Calendar, ArrowRight } from 'lucide-react';
import { FridaySession, AttendanceRecord } from '@/types';
import { exportAttendanceCSVAction, getLeaderReportsDataAction } from '@/app/actions/scout-actions';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function LeaderReportsPage() {
  const [sessions, setSessions] = useState<FridaySession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    async function loadReports() {
      try {
        const data = await getLeaderReportsDataAction();
        setSessions(data.sessions);
        setSelectedSessionId(data.selectedSessionId);
        setRecords(data.records);
      } catch (err) {
        console.error('Failed to load leader reports', err);
      }
    }
    loadReports();
  }, []);

  const handleSessionChange = async (id: string) => {
    setSelectedSessionId(id);
    try {
      const data = await getLeaderReportsDataAction(undefined, id);
      setRecords(data.records);
    } catch (err) {
      console.error(err);
    }
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
      link.setAttribute('download', `leader-attendance-${selectedSessionId}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('حدث خطأ أثناء تصدير التقرير');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/leader" className="text-xs text-charcoal/60 hover:text-forest flex items-center gap-1 font-bold">
              <span>لوحة القائد</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <span className="text-xs text-charcoal/40">/</span>
            <span className="text-xs font-bold text-forest">تقارير الحضور</span>
          </div>
          <h1 className="text-2xl font-black text-forest">تقارير حضور القسم المصرح به 🏕️</h1>
          <p className="text-xs text-charcoal/70">
            تصدير واستعراض إحصائيات حضور كشافة نطاقك القيادي في اجتماعات الجمعة
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
          <span>تصدير تقرير Excel / CSV</span>
        </Button>
      </div>

      <div className="bg-white p-4 rounded-3xl border border-sand scout-card-shadow flex items-center gap-3">
        <Calendar className="w-5 h-5 text-forest" />
        <span className="text-xs font-bold text-forest whitespace-nowrap">اجتماع الجمعة:</span>
        <select
          value={selectedSessionId}
          onChange={(e) => handleSessionChange(e.target.value)}
          className="w-full sm:w-72 px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs font-bold text-forest outline-none"
        >
          {sessions.map((sess) => (
            <option key={sess.id} value={sess.id}>
              {sess.title} ({sess.session_date})
            </option>
          ))}
        </select>
      </div>

      <Card className="bg-white rounded-3xl border-sand scout-card-shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-sand/30 text-forest font-bold border-b border-sand/60">
              <tr>
                <th className="py-3 px-4">رقم القيد</th>
                <th className="py-3 px-4">اسم الكشاف</th>
                <th className="py-3 px-4">توقيت الحضور</th>
                <th className="py-3 px-4">الزي الكشفي</th>
                <th className="py-3 px-4">حالة الوصول</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand/40">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-charcoal/50">
                    لا توجد سجلات حضور مسجلة لهذا الاجتماع في نطاقك
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="hover:bg-cream/20 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-forest">{r.member?.member_number || '---'}</td>
                    <td className="py-3 px-4 font-bold text-forest">{r.member?.full_name || 'كشاف'}</td>
                    <td className="py-3 px-4 text-charcoal/70 font-mono">
                      {new Date(r.recorded_at).toLocaleTimeString('ar-EG')}
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
