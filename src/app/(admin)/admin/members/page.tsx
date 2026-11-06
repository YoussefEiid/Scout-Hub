'use client';

import React, { useState, useEffect } from 'react';
import {
  Search,
  RefreshCw,
} from 'lucide-react';
import { TopNavbar } from '@/components/navigation/TopNavbar';
import { BottomMobileNav } from '@/components/navigation/BottomMobileNav';
import { Profile } from '@/types';
import { rotateMemberQRTokenAction, getAdminMembersDataAction } from '@/app/actions/scout-actions';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function AdminMembersPage() {
  const [members, setMembers] = useState<Profile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [rotatingId, setRotatingId] = useState<string | null>(null);

  useEffect(() => {
    async function loadMembers() {
      try {
        const data = await getAdminMembersDataAction();
        setMembers(data.members);
      } catch (err) {
        console.error('Failed to load members', err);
      }
    }
    loadMembers();
  }, []);

  const handleRotate = async (memberId: string) => {
    const confirm = window.confirm('هل تريد إبطال الرمز القديم وإصدار رمز QR جديد لهذا الكشاف؟');
    if (!confirm) return;

    setRotatingId(memberId);
    try {
      await rotateMemberQRTokenAction(memberId);
      alert('تم تجديد رمز البطاقة بنجاح');
    } catch {
      alert('حدث خطأ أثناء تجديد الرمز');
    } finally {
      setRotatingId(null);
    }
  };

  const stageLabels: Record<string, string> = {
    stage_1: 'أشبال',
    stage_2: 'فتيان',
    stage_3: 'متقدم',
  };

  const filtered = members.filter((m) => {
    const matchesSearch =
      m.full_name.includes(searchQuery.trim()) ||
      m.member_number.toLowerCase().includes(searchQuery.trim().toLowerCase());
    const matchesStage = selectedStage === 'all' || m.stage_id === selectedStage;
    return matchesSearch && matchesStage;
  });

  return (
    <div className="min-h-screen flex flex-col bg-cream text-charcoal pb-24 md:pb-12">
      <TopNavbar currentRole="admin" />

      <main className="max-w-4xl mx-auto w-full px-4 pt-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-forest">سجل الكشافة والأفراد</h1>
            <p className="text-xs text-charcoal/70">
              إدارة 60 عضواً مقيدين بالفوج وإدارة بطاقات الـ QR
            </p>
          </div>

          <Badge variant="emerald" size="md">
            {filtered.length} كشاف
          </Badge>
        </div>

        {/* Search & Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative sm:col-span-2">
            <input
              type="text"
              placeholder="ابحث بالاسم أو رقم القيد الكشفي..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2.5 pr-10 rounded-xl border border-sand bg-white text-xs outline-none focus:border-emerald text-right shadow-sm"
            />
            <Search className="w-4 h-4 text-charcoal/40 absolute left-3 top-3" />
          </div>

          <select
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-sand bg-white text-xs outline-none focus:border-emerald text-right shadow-sm"
          >
            <option value="all">جميع المراحل الكشفية</option>
            <option value="stage_1">مرحلة الأشبال (المرحلة 1)</option>
            <option value="stage_2">مرحلة الفتيان (المرحلة 2)</option>
            <option value="stage_3">مرحلة المتقدم (المرحلة 3)</option>
          </select>
        </div>

        {/* Members Roster List */}
        <Card className="bg-white/95">
          <CardContent className="p-0">
            <div className="divide-y divide-sand/20">
              {filtered.map((m) => (
                <div key={m.id} className="p-4 flex items-center justify-between gap-3 hover:bg-sand/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-forest text-cream font-bold flex items-center justify-center text-xs shrink-0">
                      {m.full_name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-forest">{m.full_name}</span>
                        {m.roles?.includes('super_admin') && (
                          <span className="text-[10px] bg-orange text-white px-1.5 py-0.2 rounded font-bold">
                            قائد عام
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-charcoal/60 mt-0.5">
                        <span className="font-mono">{m.member_number}</span> —{' '}
                        <span>{stageLabels[m.stage_id] || m.stage_id}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRotate(m.id)}
                      isLoading={rotatingId === m.id}
                      className="text-xs bg-white py-1 h-auto"
                      title="إبطال وإصدار رمز جديد للبطاقة"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-forest ml-1" />
                      <span>تجديد الرمز</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>

      <BottomMobileNav currentRole="admin" />
    </div>
  );
}
