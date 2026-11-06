'use client';

import React, { useState, useEffect } from 'react';
import { TopNavbar } from '@/components/navigation/TopNavbar';
import { BottomMobileNav } from '@/components/navigation/BottomMobileNav';
import { ScoutCard } from '@/components/scout/ScoutCard';
import { rotateMemberQRTokenAction, getMemberCardDataAction } from '@/app/actions/scout-actions';
import { Profile } from '@/types';
import { ShieldCheck } from 'lucide-react';

export default function DigitalCardPage() {
  const [member, setMember] = useState<Profile | null>(null);
  const [qrToken, setQrToken] = useState<string>('');

  useEffect(() => {
    async function loadCard() {
      const data = await getMemberCardDataAction();
      setMember(data.member);
      setQrToken(data.qrToken);
    }
    loadCard();
  }, []);

  const handleRotate = async () => {
    if (!member) throw new Error('لا يوجد عضو محدد');
    const newToken = await rotateMemberQRTokenAction(member.id);
    setQrToken(newToken);
    return newToken;
  };

  if (!member || !qrToken) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-4">
        <p className="text-sm font-bold text-forest">جاري استرجاع بطاقتك الكشفية...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-cream text-charcoal pb-24 md:pb-12">
      <TopNavbar currentRole={member.roles?.[0]} userName={member.full_name} />

      <main className="max-w-md mx-auto w-full px-4 pt-6 space-y-6">
        <div className="text-center space-y-1 no-print">
          <h1 className="text-xl sm:text-2xl font-black text-forest">بطاقة الهوية الكشفية الرقمية</h1>
          <p className="text-xs text-charcoal/70">
            أظهر هذه البطاقة لقائد الطابور في اجتماع الجمعة لتسجيل حضورك
          </p>
        </div>

        {/* The Digital Card Component */}
        <ScoutCard
          member={member}
          qrToken={qrToken}
          onRotateToken={handleRotate}
          canRotate={true}
        />

        {/* Security & Instructions Banner */}
        <div className="p-4 rounded-2xl bg-white border border-sand/80 text-xs text-charcoal/80 space-y-2 no-print shadow-sm">
          <div className="flex items-center gap-1.5 font-bold text-forest">
            <ShieldCheck className="w-4 h-4 text-emerald" />
            <span>إرشادات أمان البطاقة الكشفية:</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-[11px] text-charcoal/70">
            <li>الرمز الرقمي مشفر بنظام فريد ولا يحتوي على أي بيانات شخصية معلنة.</li>
            <li>في حال فقدان الكارت المطبوع أو تصويره من شخص آخر، يمكنك النقر على &quot;تجديد الرمز&quot; لإبطاله فورًا.</li>
            <li>يمكنك حفظ الصفحة أو طباعة الكارت كـ PDF لاستخدامه في المعسكرات بدون إنترنت.</li>
          </ul>
        </div>
      </main>

      <BottomMobileNav currentRole={member.roles?.[0]} />
    </div>
  );
}
