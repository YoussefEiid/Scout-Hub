'use client';

import React, { useState, useEffect } from 'react';
import { TopNavbar } from '@/components/navigation/TopNavbar';
import { BottomMobileNav } from '@/components/navigation/BottomMobileNav';
import { QRScannerView } from '@/components/scout/QRScannerView';
import {
  verifyScoutQRTokenAction,
  recordAttendanceAction,
  getAdminScannerDataAction,
} from '@/app/actions/scout-actions';
import { FridaySession, Profile, UniformStatus } from '@/types';
import { Calendar } from 'lucide-react';

export default function AdminScannerPage() {
  const [activeSession, setActiveSession] = useState<FridaySession | null>(null);
  const [allMembers, setAllMembers] = useState<Profile[]>([]);
  const [attendanceCount, setAttendanceCount] = useState<number>(0);

  useEffect(() => {
    async function loadScannerData() {
      try {
        const data = await getAdminScannerDataAction();
        setActiveSession(data.activeSession);
        setAllMembers(data.allMembers);
        setAttendanceCount(data.attendanceCount);
      } catch (err) {
        console.error('Failed to load scanner data', err);
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

  if (!activeSession) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-4">
        <p className="text-sm font-bold text-forest">لا يوجد اجتماع جمعة نشط حاليًا</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-cream text-charcoal pb-24 md:pb-12">
      <TopNavbar currentRole="admin" />

      <main className="max-w-lg mx-auto w-full px-4 pt-4 space-y-4">
        {/* Session Info Bar */}
        <div className="p-3.5 bg-white rounded-2xl border border-sand/80 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-forest/10 text-forest flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-xs sm:text-sm font-black text-forest line-clamp-1">
                {activeSession.title}
              </h1>
              <p className="text-[11px] text-charcoal/60">{activeSession.session_date}</p>
            </div>
          </div>

          <div className="text-left shrink-0">
            <span className="text-xs bg-emerald/15 text-emerald-dark px-2.5 py-1 rounded-full font-bold">
              {attendanceCount} مسجلين
            </span>
          </div>
        </div>

        {/* The Fast QR Scanner View */}
        <QRScannerView
          sessionId={activeSession.id}
          onVerifyToken={handleVerify}
          onRecordAttendance={handleRecord}
          allMembers={allMembers}
        />
      </main>

      <BottomMobileNav currentRole="admin" />
    </div>
  );
}
