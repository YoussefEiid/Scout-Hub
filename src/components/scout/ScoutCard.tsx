'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { Shield, RefreshCw, Printer, CheckCircle2 } from 'lucide-react';
import { siteBranding } from '@/config/branding';
import { getFullScoutScopeDisplay } from '@/lib/sections/section-helper';
import { Profile } from '@/types';
import { formatQRPayload, generateQRCodeDataURL } from '@/lib/qr/qr-service';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

interface ScoutCardProps {
  member: Profile;
  qrToken: string;
  onRotateToken?: () => Promise<string>;
  canRotate?: boolean;
}

export function ScoutCard({ member, qrToken, onRotateToken, canRotate = true }: ScoutCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isRotating, setIsRotating] = useState(false);
  const [currentToken, setCurrentToken] = useState(qrToken);
  const [rotateSuccess, setRotateSuccess] = useState(false);

  useEffect(() => {
    async function renderQR() {
      const payload = formatQRPayload(currentToken);
      const url = await generateQRCodeDataURL(payload);
      setQrDataUrl(url);
    }
    renderQR();
  }, [currentToken]);

  const handleRotate = async () => {
    if (!onRotateToken || isRotating) return;
    const confirm = window.confirm(
      'هل أنت متأكد من إبطال هذا الرمز وإصدار رمز جديد؟ الرمز القديم لن يعمل مجددًا.'
    );
    if (!confirm) return;

    try {
      setIsRotating(true);
      const newToken = await onRotateToken();
      setCurrentToken(newToken);
      setRotateSuccess(true);
      setTimeout(() => setRotateSuccess(false), 4000);
    } catch {
      alert('حدث خطأ أثناء تدوير الرمز');
    } finally {
      setIsRotating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const scopeDisplay = getFullScoutScopeDisplay(member);

  return (
    <div className="flex flex-col items-center w-full max-w-sm mx-auto">
      {/* Physical / Digital Badge Card */}
      <div className="w-full rounded-3xl bg-gradient-to-br from-forest via-[#1e4a3e] to-forest text-cream p-6 shadow-2xl border-4 border-orange/40 relative overflow-hidden scout-print-card">
        {/* Background Scout Patterns */}
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-orange/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-40 h-40 bg-emerald/20 rounded-full blur-2xl pointer-events-none" />
        
        {/* Card Header */}
        <div className="flex items-center justify-between border-b border-sand/20 pb-4 mb-4 relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 flex items-center justify-center border border-white/20 shadow-sm shrink-0">
              <Image
                src={siteBranding.logoUrl}
                alt={siteBranding.nameAr}
                width={40}
                height={40}
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h4 className="text-sm font-black text-sand-light tracking-wide">{siteBranding.nameAr}</h4>
              <p className="text-[9px] sm:text-[10px] text-cream/80 font-medium">{siteBranding.churchInscription}</p>
            </div>
          </div>
          <Badge variant="orange" size="sm">
            {member.member_number}
          </Badge>
        </div>

        {/* Member Identity Details */}
        <div className="text-center my-3 relative z-10">
          <h2 className="text-xl font-extrabold text-white tracking-tight">{member.full_name}</h2>
          <div className="mt-1 flex items-center justify-center gap-2 flex-wrap">
            <span className="text-xs bg-emerald/30 text-emerald-light px-2.5 py-0.5 rounded-full border border-emerald/40 font-semibold" title="القسم أو المستوى الكشفي">
              {scopeDisplay}
            </span>
            {member.active_team && (
              <span className="text-xs bg-orange/20 text-orange px-2.5 py-0.5 rounded-full border border-orange/40 font-bold flex items-center gap-1">
                <span>🏕️</span>
                <span>{member.active_team.name}</span>
              </span>
            )}
          </div>
        </div>

        {/* QR Code Container */}
        <div className="my-4 bg-white p-4 rounded-2xl shadow-inner flex flex-col items-center justify-center relative z-10 mx-auto max-w-[220px]">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt={`QR Code for ${member.full_name}`}
              className="w-44 h-44 object-contain rounded-lg"
            />
          ) : (
            <div className="w-44 h-44 bg-sand/30 animate-pulse rounded-lg flex items-center justify-center text-charcoal/40 text-xs">
              جاري تجهيز الرمز...
            </div>
          )}
          <span className="text-[10px] text-charcoal/60 mt-2 font-mono tracking-wider font-semibold">
            رمز مشفر آمن للحضور
          </span>
        </div>

        {/* Footer Security Watermark */}
        <div className="pt-2 border-t border-sand/20 flex items-center justify-between text-[11px] text-cream/70 relative z-10">
          <div className="flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-emerald-light" />
            <span>معتمدة من قيادة الفوج</span>
          </div>
          <span className="text-[10px] text-sand/60">موسم 2026</span>
        </div>
      </div>

      {/* Rotation Success Alert */}
      {rotateSuccess && (
        <div className="mt-3 w-full p-2.5 bg-emerald/10 border border-emerald text-emerald-dark rounded-xl text-xs font-bold flex items-center gap-2 no-print">
          <CheckCircle2 className="w-4 h-4 text-emerald" />
          <span>تم إبطال الرمز السابق بنجاح وإصدار رمز جديد للبطاقة!</span>
        </div>
      )}

      {/* Card Actions (Print & Rotate) */}
      <div className="mt-4 flex items-center justify-center gap-2 w-full no-print">
        <Button variant="outline" size="sm" onClick={handlePrint} className="flex-1 bg-white">
          <Printer className="w-4 h-4 text-forest" />
          <span>طباعة البطاقة</span>
        </Button>
        {canRotate && onRotateToken && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRotate}
            isLoading={isRotating}
            className="text-xs text-charcoal/70 hover:text-red-700"
            title="إبطال الرمز في حال فقدان البطاقة أو تصويرها"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تجديد الرمز</span>
          </Button>
        )}
      </div>
    </div>
  );
}
