'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, ArrowRight, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { QRScannerView } from '@/components/scout/QRScannerView';
import {
  verifyScoutQRTokenAction,
  recordAttendanceAction,
  getLeaderScannerDataAction,
} from '@/app/actions/scout-actions';
import { FridaySession, Profile, UniformStatus } from '@/types';

export default function LeaderScannerPage() {
  const [activeSession, setActiveSession] = useState<FridaySession | null>(null);
  const [allMembers, setAllMembers] = useState<Profile[]>([]);
  const [attendanceCount, setAttendanceCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadScannerData() {
      try {
        const data = await getLeaderScannerDataAction();
        setActiveSession(data.activeSession);
        setAllMembers(data.allMembers);
        setAttendanceCount(data.attendanceCount);
      } catch (err) {
        console.error('Failed to load leader scanner data', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadScannerData();
  }, []);

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-4">
        <div className="w-8 h-8 border-4 border-forest border-t-orange rounded-full animate-spin" />
      </div>
    );
  }

  if (!activeSession) {
    return (
      <div className="max-w-lg mx-auto w-full px-4 pt-10 text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-sand/30 flex items-center justify-center mx-auto text-forest">
          <Calendar className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-forest">لا يوجد اجتماع جمعة نشط حاليًا</h2>
        <p className="text-xs text-charcoal/70">
          يتم فتح باب تسجيل الحضور تلقائياً صباح يوم الجمعة أو بتفعيل الجلسة من الإدارة العامة.
        </p>
        <Link href="/leader" className="inline-block pt-2">
          <button className="px-4 py-2 bg-forest text-sand-light rounded-xl text-xs font-bold">
            العودة للوحة القائد
          </button>
        </Link>
      </div>
    );
  }

  return (
    <main className="max-w-lg mx-auto w-full px-4 pt-4 space-y-4">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/leader"
          className="text-xs text-charcoal/60 hover:text-forest flex items-center gap-1 font-bold"
        >
          <span>لوحة القائد</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
        <span className="text-xs font-bold text-forest">ماسح حضور الجمعة المصرح به</span>
      </div>

      {/* Session Info Bar */}
      <div className="p-3.5 bg-white rounded-2xl border border-sand/80 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-forest/10 text-forest flex items-center justify-center">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-forest">{activeSession.title}</h2>
            <span className="text-[10px] text-charcoal/60 font-mono">
              تاريخ: {activeSession.session_date}
            </span>
          </div>
        </div>

        <div className="text-left bg-emerald/10 text-emerald-dark px-2.5 py-1 rounded-xl border border-emerald/20 text-xs font-bold">
          {attendanceCount} مسجل
        </div>
      </div>

      {/* Scope Protection Warning */}
      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-center gap-2 font-semibold">
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
