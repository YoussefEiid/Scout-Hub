'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Shirt,
  Clock,
  UserCheck,
} from 'lucide-react';
import { BrowserQRCodeReader, IScannerControls } from '@zxing/browser';
import { parseQRPayload } from '@/lib/qr/qr-service';
import { Profile, UniformStatus, AttendanceRecord } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';

interface QRScannerViewProps {
  sessionId: string;
  onVerifyToken: (token: string) => Promise<{
    member: Profile | null;
    isRevoked: boolean;
    isActive: boolean;
    isUnauthorizedScope?: boolean;
  }>;
  onRecordAttendance: (params: {
    sessionId: string;
    memberId: string;
    qrToken?: string | null;
    uniformStatus: UniformStatus;
    isManual?: boolean;
    manualReason?: string | null;
  }) => Promise<{ success: boolean; record?: AttendanceRecord; error?: string }>;
  allMembers?: Profile[];
}

export function QRScannerView({
  sessionId,
  onVerifyToken,
  onRecordAttendance,
  allMembers = [],
}: QRScannerViewProps) {
  const [isScanning, setIsScanning] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannedMember, setScannedMember] = useState<Profile | null>(null);
  const [scannedToken, setScannedToken] = useState<string | null>(null);
  const [uniformStatus, setUniformStatus] = useState<UniformStatus>('with_uniform');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scanMessage, setScanMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Manual fallback search modal
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [manualReason, setManualReason] = useState('البطاقة غير متوفرة / الكاميرا معطلة');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);

  const handleScannedToken = async (token: string) => {
    // Pause scanning while inspecting
    if (scannerControlsRef.current) {
      scannerControlsRef.current.stop();
      scannerControlsRef.current = null;
    }

    try {
      setScanMessage(null);
      const res = await onVerifyToken(token);
      if (res.isUnauthorizedScope) {
        setScanMessage({
          type: 'error',
          text: '⛔ غير مصرح: هذا الكشاف يتبع قسماً أو سنة خارج نطاق إشرافك المعتمد!',
        });
        return;
      }
      if (res.isRevoked) {
        setScanMessage({
          type: 'error',
          text: '⚠️ هذه البطاقة تم إبطالها مسبقًا! يرجى مراجعة إدارة الفوج.',
        });
        return;
      }
      if (!res.member || !res.isActive) {
        setScanMessage({
          type: 'error',
          text: '❌ رمز غير معتمد أو غير مسجل في قاعدة البيانات.',
        });
        return;
      }

      setScannedMember(res.member);
      setScannedToken(token);
      setIsScanning(false);
    } catch {
      setScanMessage({
        type: 'error',
        text: 'حدث خطأ في الاتصال أثناء التحقق من الرمز.',
      });
    }
  };

  const handleScannedTokenRef = useRef(handleScannedToken);
  useEffect(() => {
    handleScannedTokenRef.current = handleScannedToken;
  });

  useEffect(() => {
    let active = true;
    const codeReader = new BrowserQRCodeReader();

    async function startScanner() {
      if (!videoRef.current || !isScanning) return;
      try {
        setCameraError(null);
        // Request back environment camera
        const controls = await codeReader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result) => {
            if (!active) return;
            if (result) {
              const text = result.getText();
              const tokenId = parseQRPayload(text);
              if (tokenId) {
                handleScannedTokenRef.current(tokenId);
              }
            }
          }
        );
        scannerControlsRef.current = controls;
      } catch (err: unknown) {
        console.error('Camera initialization error:', err);
        setCameraError('تعذر فتح الكاميرا. يرجى التأكد من منح الإذن أو استخدام التسجيل اليدوي.');
      }
    }

    if (isScanning && !scannedMember) {
      startScanner();
    }

    return () => {
      active = false;
      if (scannerControlsRef.current) {
        scannerControlsRef.current.stop();
        scannerControlsRef.current = null;
      }
    };
  }, [isScanning, scannedMember]);

  const handleConfirmAttendance = async () => {
    if (!scannedMember) return;
    setIsSubmitting(true);
    try {
      const res = await onRecordAttendance({
        sessionId,
        memberId: scannedMember.id,
        qrToken: scannedToken,
        uniformStatus,
        isManual: !scannedToken,
        manualReason: !scannedToken ? manualReason : undefined,
      });

      if (!res.success) {
        setScanMessage({
          type: 'error',
          text: res.error || 'تعذر تسجيل الحضور',
        });
        setIsSubmitting(false);
        return;
      }

      // Success feedback
      setScanMessage({
        type: 'success',
        text: `تم تسجيل حضور الكشاف: ${scannedMember.full_name} بنجاح ✅`,
      });

      // Quick auto-reset to next scan after 1.8 seconds
      setTimeout(() => {
        resetScanner();
      }, 1800);
    } catch {
      setScanMessage({
        type: 'error',
        text: 'فشل حفظ الحضور في السيرفر',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetScanner = () => {
    setScannedMember(null);
    setScannedToken(null);
    setScanMessage(null);
    setUniformStatus('with_uniform');
    setIsScanning(true);
  };

  const stageNames: Record<string, string> = {
    stage_1: 'أشبال',
    stage_2: 'فتيان',
    stage_3: 'متقدم',
  };

  // Filtered members for manual entry
  const filteredMembers = searchQuery.trim()
    ? allMembers.filter(
        (m) =>
          m.full_name.includes(searchQuery.trim()) ||
          m.member_number.toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : [];

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-orange text-white flex items-center justify-center shadow-sm">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-forest">ماسح حضور الجمعة</h2>
            <p className="text-[11px] text-charcoal/60">وجّه الكاميرا لبطاقة الكشاف</p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsManualModalOpen(true)}
          className="text-xs bg-white"
        >
          <Search className="w-3.5 h-3.5 text-forest" />
          <span>تسجيل يدوي</span>
        </Button>
      </div>

      {/* Active Scanner Viewfinder */}
      {isScanning && !scannedMember && (
        <div className="relative w-full aspect-square bg-charcoal rounded-3xl overflow-hidden shadow-2xl border-4 border-forest">
          {/* Video Stream */}
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />

          {/* Scout HUD Viewfinder Overlay */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-8">
            <div className="relative w-56 h-56 border-2 border-dashed border-orange/80 rounded-2xl flex items-center justify-center">
              {/* Corner accents */}
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-orange rounded-tl-xl -mt-1 -ml-1" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-orange rounded-tr-xl -mt-1 -mr-1" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-orange rounded-bl-xl -mb-1 -ml-1" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-orange rounded-br-xl -mb-1 -mr-1" />

              <span className="text-[11px] font-bold text-white bg-charcoal/70 px-3 py-1 rounded-full backdrop-blur-md">
                ضع الرمز داخل الإطار
              </span>
            </div>
          </div>

          {/* Camera Error Message */}
          {cameraError && (
            <div className="absolute inset-0 bg-charcoal/90 p-6 flex flex-col items-center justify-center text-center text-white">
              <AlertTriangle className="w-12 h-12 text-orange mb-3" />
              <p className="text-sm font-bold mb-4">{cameraError}</p>
              <Button
                variant="adventure"
                size="sm"
                onClick={() => setIsManualModalOpen(true)}
              >
                استخدام التسجيل اليدوي
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Feedback Message (Alerts) */}
      {scanMessage && (
        <div
          className={`p-3.5 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2.5 ${
            scanMessage.type === 'success'
              ? 'bg-emerald/15 text-emerald-dark border border-emerald/30'
              : scanMessage.type === 'error'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-orange/15 text-orange-hover border border-orange/30'
          }`}
        >
          {scanMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 text-red-600 shrink-0" />
          )}
          <span>{scanMessage.text}</span>
        </div>
      )}

      {/* Scanned Member Confirmation Card */}
      {scannedMember && (
        <Card className="border-2 border-emerald bg-white shadow-xl animate-in zoom-in-95 duration-200">
          <CardHeader className="border-b border-sand/40 pb-3">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-forest text-cream font-bold flex items-center justify-center text-sm shadow-sm">
                  {scannedMember.full_name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-forest">{scannedMember.full_name}</h3>
                  <p className="text-xs text-charcoal/60">{scannedMember.member_number}</p>
                </div>
              </div>
              <Badge variant="emerald" size="sm">
                {stageNames[scannedMember.stage_id] || 'كشاف'}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="pt-4 space-y-4">
            {scannedMember.active_team && (
              <div className="p-2.5 rounded-xl bg-sand/30 border border-sand/60 text-xs flex items-center justify-between">
                <span className="font-semibold text-charcoal/80">الطليعة المقيد بها:</span>
                <span className="font-bold text-forest">🏕️ {scannedMember.active_team.name}</span>
              </div>
            )}

            {/* Fast Uniform Status Toggle */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-charcoal/80 flex items-center gap-1.5">
                <Shirt className="w-4 h-4 text-forest" />
                <span>الالتزام بالزي الكشفي:</span>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setUniformStatus('with_uniform')}
                  className={`p-3 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    uniformStatus === 'with_uniform'
                      ? 'bg-emerald text-white border-emerald shadow-sm'
                      : 'bg-white text-charcoal border-sand hover:border-emerald/40'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>بالزي الكامل</span>
                </button>

                <button
                  type="button"
                  onClick={() => setUniformStatus('without_uniform')}
                  className={`p-3 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    uniformStatus === 'without_uniform'
                      ? 'bg-orange text-white border-orange shadow-sm'
                      : 'bg-white text-charcoal border-sand hover:border-orange/40'
                  }`}
                >
                  <XCircle className="w-4 h-4" />
                  <span>بدون الزي</span>
                </button>
              </div>
            </div>

            {/* Authoritative Server Clock Notice */}
            <div className="p-2.5 rounded-lg bg-sand/20 border border-sand/40 text-[11px] text-charcoal/70 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald" />
              <span>وقت الوصول المعتمد: الآن وفق توقيت السيرفر الرسمي</span>
            </div>

            {/* Actions: Confirm Attendance or Cancel */}
            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="adventure"
                size="md"
                className="flex-1 text-sm font-black shadow-lg"
                onClick={handleConfirmAttendance}
                isLoading={isSubmitting}
              >
                <UserCheck className="w-5 h-5 ml-1" />
                <span>تسجيل الحضور الآن</span>
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={resetScanner}
                disabled={isSubmitting}
                className="text-xs"
              >
                <RotateCcw className="w-4 h-4" />
                <span>إلغاء</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual Attendance Fallback Modal */}
      <Modal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        title="التسجيل اليدوي للحضور"
        description="ابحث عن الكشاف بالاسم أو رقم القيد لتسجيل حضوره في حال تعذر المسح."
      >
        <div className="space-y-4">
          <div className="relative">
            <input
              type="text"
              placeholder="اكتب اسم الكشاف أو رقم القيد..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2.5 pr-10 rounded-xl border border-sand focus:border-emerald focus:ring-1 focus:ring-emerald text-sm outline-none bg-cream/30 text-right"
              autoFocus
            />
            <Search className="w-4 h-4 text-charcoal/40 absolute left-3 top-3.5" />
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-sand/30">
            {filteredMembers.length > 0 ? (
              filteredMembers.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setScannedMember(m);
                    setScannedToken(null);
                    setIsManualModalOpen(false);
                    setIsScanning(false);
                  }}
                  className="w-full text-right p-3 hover:bg-sand/30 rounded-xl flex items-center justify-between transition-colors"
                >
                  <div>
                    <div className="text-sm font-bold text-forest">{m.full_name}</div>
                    <div className="text-xs text-charcoal/60">{m.member_number}</div>
                  </div>
                  <span className="text-xs bg-emerald/10 text-emerald px-2 py-0.5 rounded font-bold">
                    اختيار
                  </span>
                </button>
              ))
            ) : (
              <p className="text-xs text-center py-6 text-charcoal/50">
                {searchQuery ? 'لا توجد نتائج مطابقة' : 'ابدأ بكتابة الاسم في مربع البحث أعلاه'}
              </p>
            )}
          </div>

          <div className="pt-2 border-t border-sand/40">
            <label className="text-xs font-bold text-charcoal/80 block mb-1">سبب التسجيل اليدوي:</label>
            <input
              type="text"
              value={manualReason}
              onChange={(e) => setManualReason(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-sand text-xs outline-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
