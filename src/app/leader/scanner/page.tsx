'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Calendar,
  ShieldAlert,
  Play,
  Settings,
  Layers,
  Clock,
} from 'lucide-react';
import { QRScannerView } from '@/components/scout/QRScannerView';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import {
  verifyScoutQRTokenAction,
  recordAttendanceAction,
  getLeaderScannerDataAction,
  toggleMeetingAttendanceAction,
} from '@/app/actions/scout-actions';
import { FridaySession, Profile, UniformStatus } from '@/types';

function ScannerContent() {
  const searchParams = useSearchParams();
  const querySessionId = searchParams.get('sessionId') || undefined;

  const [activeSession, setActiveSession] = useState<FridaySession | null>(null);
  const [openSessions, setOpenSessions] = useState<FridaySession[]>([]);
  const [scheduledSessions, setScheduledSessions] = useState<FridaySession[]>([]);
  const [allMembers, setAllMembers] = useState<Profile[]>([]);
  const [attendanceCount, setAttendanceCount] = useState<number>(0);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isActivating, setIsActivating] = useState(false);

  const loadScannerData = async (targetId?: string) => {
    try {
      setIsLoading(true);
      const data = await getLeaderScannerDataAction(undefined, targetId || querySessionId);
      setActiveSession(data.activeSession);
      setOpenSessions(data.openSessions || []);
      setScheduledSessions(data.scheduledSessions || []);
      setAllMembers(data.allMembers || []);
      setAttendanceCount(data.attendanceCount || 0);
      setIsSuperAdmin(Boolean(data.isSuperAdmin));
      setIsAdmin(Boolean(data.isAdmin));
    } catch (err) {
      console.error('Failed to load leader scanner data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadScannerData();
  }, [querySessionId]);

  const handleVerify = async (token: string) => {
    return verifyScoutQRTokenAction(token);
  };

  const handleRecord = async (params: {
    sessionId: string;
    memberId: string;
    qrToken?: string | null;
    uniformStatus: UniformStatus;
    isManual?: boolean;
    manualReason?: string | null;
  }) => {
    const res = await recordAttendanceAction(params);
    if (res.success) {
      setAttendanceCount((prev) => prev + 1);
    }
    return res;
  };

  const handleActivateSession = async (sessionToOpen: FridaySession) => {
    try {
      setIsActivating(true);
      await toggleMeetingAttendanceAction(sessionToOpen.id, true);
      await loadScannerData(sessionToOpen.id);
    } catch (err) {
      alert('تعذر فتح باب الحضور، يرجى المحاولة من لوحة الإدارة.');
    } finally {
      setIsActivating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="w-8 h-8 border-4 border-forest border-t-orange rounded-full animate-spin" />
      </div>
    );
  }

  // If NO active open session exists
  if (!activeSession || !activeSession.is_open_for_attendance) {
    const nextSession = scheduledSessions[0] || null;

    return (
      <div className="max-w-lg mx-auto w-full px-4 pt-8 text-center space-y-5">
        <div className="w-16 h-16 rounded-3xl bg-sand/40 flex items-center justify-center mx-auto text-forest shadow-sm">
          <Calendar className="w-8 h-8 text-forest" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-black text-forest">لا يوجد اجتماع جمعة نشط حاليًا</h2>
          <p className="text-xs text-charcoal/70 max-w-sm mx-auto leading-relaxed">
            يتم فتح باب تسجيل الحضور تلقائياً صباح يوم الجمعة أو بتفعيل الاجتماع من الإدارة العامة للفوج.
          </p>
        </div>

        {/* Next Scheduled Meeting Banner if available */}
        {nextSession && (
          <div className="p-4 rounded-2xl bg-white border border-sand/80 scout-card-shadow text-right space-y-2">
            <span className="text-[10px] font-black uppercase text-orange bg-orange/10 px-2 py-0.5 rounded-full">
              الاجتماع المجدول القادم
            </span>
            <h3 className="text-sm font-black text-forest">{nextSession.title}</h3>
            <p className="text-xs text-charcoal/70 flex items-center gap-2 font-mono">
              <Calendar className="w-3.5 h-3.5 text-forest" />
              <span>التاريخ: {nextSession.session_date}</span>
              <span>•</span>
              <Clock className="w-3.5 h-3.5 text-forest" />
              <span>البدء: {nextSession.start_time.slice(0, 5)}</span>
            </p>

            {(isSuperAdmin || isAdmin) && (
              <div className="pt-2">
                <Button
                  variant="adventure"
                  size="sm"
                  onClick={() => handleActivateSession(nextSession)}
                  isLoading={isActivating}
                  className="w-full flex items-center justify-center gap-2 text-xs"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>فتح باب الحضور لهذا الاجتماع الآن 🟢</span>
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 pt-2">
          {(isSuperAdmin || isAdmin) && (
            <Link href="/super-admin/attendance">
              <Button variant="outline" size="sm" className="w-full bg-white text-forest text-xs">
                <Settings className="w-3.5 h-3.5 text-orange ml-1" />
                <span>إدارة اجتماعات الجمعة بالإدارة العامة</span>
              </Button>
            </Link>
          )}

          <BackButton fallbackUrl="/leader" label="رجوع للوحة القائد" />
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-lg mx-auto w-full px-4 pt-4 pb-10 space-y-4">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between">
        <BackButton fallbackUrl="/leader" label="رجوع للوحة القائد" />
        <span className="text-xs font-bold text-forest">ماسح حضور كشافة الفنار المصرح به</span>
      </div>

      {/* Multiple Open Sessions Switcher */}
      {openSessions.length > 1 && (
        <div className="bg-white p-2.5 rounded-2xl border border-sand/80 shadow-sm flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-forest whitespace-nowrap flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-forest" />
            <span>الاجتماع النشط:</span>
          </span>
          <select
            value={activeSession.id}
            onChange={(e) => loadScannerData(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-xl border border-sand bg-cream/30 text-xs font-bold text-forest outline-none"
          >
            {openSessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.section?.name || 'عام'})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Active Session Info Bar */}
      <div className="p-3.5 bg-white rounded-3xl border border-sand/80 scout-card-shadow flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-emerald/10 text-emerald flex items-center justify-center">
            <Calendar className="w-5 h-5 text-emerald" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-black text-forest">{activeSession.title}</h2>
              <span className="w-2 h-2 rounded-full bg-emerald animate-ping" />
            </div>
            <p className="text-[10px] text-charcoal/60 font-mono mt-0.5">
              <span>{activeSession.session_date}</span>
              {activeSession.section && (
                <span className="mr-1 bg-sand/30 text-forest px-1.5 py-0.2 rounded font-bold">
                  {activeSession.section.name}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="text-left bg-emerald/10 text-emerald-dark px-3 py-1.5 rounded-2xl border border-emerald/20 text-xs font-black">
          {attendanceCount} حضور
        </div>
      </div>

      {/* Scope Protection Warning */}
      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] text-amber-900 flex items-center gap-2 font-semibold">
        <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
        <span>حماية النطاق: التحضير مقصور فقط على كشافين وأشبال نطاقك القيادي المعتمد.</span>
      </div>

      {/* Core Scanner View Component */}
      <QRScannerView
        sessionId={activeSession.id}
        onVerifyToken={handleVerify}
        onRecordAttendance={handleRecord}
        allMembers={allMembers}
      />
    </main>
  );
}

export default function LeaderScannerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center p-4">
          <div className="w-8 h-8 border-4 border-forest border-t-orange rounded-full animate-spin" />
        </div>
      }
    >
      <ScannerContent />
    </Suspense>
  );
}
