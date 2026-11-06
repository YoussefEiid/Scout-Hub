'use client';

import React, { useState } from 'react';
import { Calendar, CheckCircle2, XCircle, MessageCircle, AlertCircle } from 'lucide-react';
import { FridaySession, WeeklyResponseType, WeeklyResponse } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface FridayAttendanceWidgetProps {
  session: FridaySession;
  initialResponse?: WeeklyResponse | null;
  onSubmitResponse: (response: WeeklyResponseType) => Promise<WeeklyResponse>;
}

export function FridayAttendanceWidget({
  session,
  initialResponse,
  onSubmitResponse,
}: FridayAttendanceWidgetProps) {
  const [selected, setSelected] = useState<WeeklyResponseType | null>(initialResponse?.response || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSelect = async (type: WeeklyResponseType) => {
    setSelected(type);
    setIsSubmitting(true);
    try {
      await onSubmitResponse(type);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch {
      alert('تعذر حفظ الرد، يرجى المحاولة لاحقًا');
    } finally {
      setIsSubmitting(false);
    }
  };

  const options: {
    id: WeeklyResponseType;
    label: string;
    description: string;
    icon: React.ElementType;
    activeClass: string;
    borderClass: string;
  }[] = [
    {
      id: 'attending',
      label: 'هحضر الجمعة 🏕️',
      description: 'مستعد للمغامرة ومتحمس لاجتماع الجمعة!',
      icon: CheckCircle2,
      activeClass: 'bg-emerald text-white shadow-md',
      borderClass: 'border-emerald/40 hover:border-emerald',
    },
    {
      id: 'absent',
      label: 'مش هقدر أحضر',
      description: 'أعتذر عن الحضور هذا الأسبوع لظروف خاصة.',
      icon: XCircle,
      activeClass: 'bg-red-600 text-white shadow-md',
      borderClass: 'border-red-200 hover:border-red-500',
    },
    {
      id: 'circumstances',
      label: 'عندي ظروف وهتفاعل على الجروب 💬',
      description: 'مش هقدر أكون متواجد فعليًا، لكن متابع مع طليعتي أونلاين.',
      icon: MessageCircle,
      activeClass: 'bg-orange text-white shadow-md',
      borderClass: 'border-orange/40 hover:border-orange',
    },
  ];

  return (
    <Card className="w-full border-sand bg-white/95">
      <CardHeader className="border-b border-sand/30 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald/10 text-emerald flex items-center justify-center">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <CardTitle className="text-base text-forest">اجتماع الجمعة القادم</CardTitle>
            <p className="text-xs text-charcoal/60 mt-0.5">{session.session_date}</p>
          </div>
        </div>
        <Badge variant={session.is_open_for_attendance ? 'emerald' : 'sand'} size="sm">
          {session.is_open_for_attendance ? 'التسجيل مفتوح' : 'محدد مسبقًا'}
        </Badge>
      </CardHeader>

      <CardContent className="pt-3">
        <p className="text-sm font-bold text-forest mb-1">{session.title}</p>
        {session.notes && <p className="text-xs text-charcoal/70 mb-4">{session.notes}</p>}

        <div className="space-y-2.5 my-3">
          <p className="text-xs font-bold text-charcoal/80 mb-2">تأكيد الحضور المسبق للأسبوع:</p>

          {options.map((opt) => {
            const Icon = opt.icon;
            const isCurrent = selected === opt.id;

            return (
              <button
                key={opt.id}
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSelect(opt.id)}
                className={`w-full text-right p-3 rounded-xl border-2 transition-all flex items-center justify-between gap-3 cursor-pointer ${
                  isCurrent ? opt.activeClass : `bg-cream/40 text-charcoal ${opt.borderClass}`
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-5 h-5 shrink-0 ${isCurrent ? 'text-white' : 'text-charcoal/60'}`} />
                  <div>
                    <div className="text-xs sm:text-sm font-bold">{opt.label}</div>
                    <div className={`text-[11px] ${isCurrent ? 'text-white/90' : 'text-charcoal/60'}`}>
                      {opt.description}
                    </div>
                  </div>
                </div>
                {isCurrent && <span className="text-xs font-bold shrink-0">✓ محدد</span>}
              </button>
            );
          })}
        </div>

        {savedSuccess && (
          <div className="mt-2 text-xs font-bold text-emerald flex items-center gap-1.5 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4" />
            <span>تم حفظ ردك بنجاح! ننتظرك بكل حماس.</span>
          </div>
        )}

        <div className="mt-4 p-2.5 rounded-lg bg-sand/30 border border-sand/60 text-[11px] text-charcoal/70 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-orange shrink-0 mt-0.5" />
          <span>
            <strong>تنويه كشفي:</strong> تأكيد الرغبة هنا يساعد القادة في تجهيز الأنشطة. الحضور الفعلي يسجل فقط
            بمسح بطاقتك الـ QR من القائد في الطابور الصباحي.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
