'use client';

import React, { useState, useEffect } from 'react';
import {
  Download,
  Users,
  Shirt,
  Clock,
  CheckCircle2,
  FileSpreadsheet,
} from 'lucide-react';
import { TopNavbar } from '@/components/navigation/TopNavbar';
import { BottomMobileNav } from '@/components/navigation/BottomMobileNav';
import { FridaySession, AttendanceRecord } from '@/types';
import { exportAttendanceCSVAction, getAdminReportsDataAction } from '@/app/actions/scout-actions';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function AdminReportsPage() {
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
      const csv = await exportAttendanceCSVAction(selectedSessionId);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `حضور_اجتماع_${selectedSessionId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('حدث خطأ أثناء تصدير التقرير');
    } finally {
      setIsExporting(false);
    }
  };

  const totalAttendees = records.length;
  const uniformAttendees = records.filter((r) => r.uniform_status === 'with_uniform').length;
  const uniformPercentage = totalAttendees > 0 ? Math.round((uniformAttendees / totalAttendees) * 100) : 0;
  const onTimeAttendees = records.filter((r) => r.arrival_status === 'on_time').length;
  const onTimePercentage = totalAttendees > 0 ? Math.round((onTimeAttendees / totalAttendees) * 100) : 0;

  const stageLabels: Record<string, string> = {
    stage_1: 'أشبال',
    stage_2: 'فتيان',
    stage_3: 'متقدم',
  };

  return (
    <div className="min-h-screen flex flex-col bg-cream text-charcoal pb-24 md:pb-12">
      <TopNavbar currentRole="admin" />

      <main className="max-w-4xl mx-auto w-full px-4 pt-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-forest">إحصائيات وتقارير الحضور</h1>
            <p className="text-xs text-charcoal/70">
              متابعة التزام الكشافة، نسب الزي الكشفي وتصدير التقارير الرسمية
            </p>
          </div>

          <Button
            variant="adventure"
            size="sm"
            onClick={handleExportCSV}
            isLoading={isExporting}
            className="shadow-md text-xs"
          >
            <Download className="w-4 h-4 ml-1" />
            <span>تصدير تقرير Excel / CSV</span>
          </Button>
        </div>

        {/* Session Selector Strip */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSessionChange(s.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border cursor-pointer ${
                selectedSessionId === s.id
                  ? 'bg-forest text-cream border-forest shadow-sm'
                  : 'bg-white text-charcoal border-sand hover:border-forest/40'
              }`}
            >
              {s.session_date}
            </button>
          ))}
        </div>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-4 bg-white/95 text-center">
            <div className="w-8 h-8 rounded-lg bg-emerald/10 text-emerald flex items-center justify-center mx-auto mb-2">
              <Users className="w-4 h-4" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-forest">{totalAttendees}</div>
            <div className="text-[11px] text-charcoal/60 font-semibold">إجمالي الحاضرين</div>
          </Card>

          <Card className="p-4 bg-white/95 text-center">
            <div className="w-8 h-8 rounded-lg bg-forest/10 text-forest flex items-center justify-center mx-auto mb-2">
              <Shirt className="w-4 h-4" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-forest">{uniformPercentage}%</div>
            <div className="text-[11px] text-charcoal/60 font-semibold">
              الالتزام بالزي ({uniformAttendees} كشافاً)
            </div>
          </Card>

          <Card className="p-4 bg-white/95 text-center">
            <div className="w-8 h-8 rounded-lg bg-orange/15 text-orange flex items-center justify-center mx-auto mb-2">
              <Clock className="w-4 h-4" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-orange">{onTimePercentage}%</div>
            <div className="text-[11px] text-charcoal/60 font-semibold">
              الحضور في الموعد ({onTimeAttendees} كشافاً)
            </div>
          </Card>

          <Card className="p-4 bg-white/95 text-center">
            <div className="w-8 h-8 rounded-lg bg-emerald/10 text-emerald flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-forest">60</div>
            <div className="text-[11px] text-charcoal/60 font-semibold">المقيدين بالفوج</div>
          </Card>
        </div>

        {/* Attendance Records Table */}
        <Card className="bg-white/95">
          <CardHeader className="border-b border-sand/30 pb-3">
            <CardTitle className="text-base text-forest flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald" />
              <span>كشف الحضور المسجل للاجتماع</span>
            </CardTitle>
            <span className="text-xs text-charcoal/60">{records.length} كشاف مسجل</span>
          </CardHeader>

          <CardContent className="pt-2">
            {records.length > 0 ? (
              <div className="divide-y divide-sand/20 overflow-x-auto">
                {records.map((r) => (
                  <div key={r.id} className="py-2.5 flex items-center justify-between gap-3 text-xs min-w-[280px]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-forest/10 text-forest font-bold flex items-center justify-center text-xs shrink-0">
                        {r.member?.full_name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-bold text-charcoal">{r.member?.full_name}</div>
                        <div className="text-[10px] text-charcoal/50">
                          {r.member?.member_number} — {stageLabels[r.member?.stage_id || '']}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant={r.uniform_status === 'with_uniform' ? 'emerald' : 'orange'}
                        size="sm"
                      >
                        {r.uniform_status === 'with_uniform' ? 'بالزي الكامل' : 'بدون الزي'}
                      </Badge>
                      <span className="text-[10px] text-charcoal/60 font-mono">
                        {new Date(r.recorded_at).toLocaleTimeString('ar-EG', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-center py-8 text-charcoal/50">
                لم يتم تسجيل أي حضور حتى الآن لهذا الاجتماع.
              </p>
            )}
          </CardContent>
        </Card>
      </main>

      <BottomMobileNav currentRole="admin" />
    </div>
  );
}
