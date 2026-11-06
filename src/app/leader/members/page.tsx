'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, ArrowRight, User } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { getLeaderMembersAction } from '@/app/actions/scout-actions';
import { Profile } from '@/types';

export default function LeaderMembersPage() {
  const [members, setMembers] = useState<Profile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getLeaderMembersAction();
        setMembers(data.members);
      } catch (err) {
        console.error('Failed to load leader members', err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const filteredMembers = members.filter(
    (m) =>
      m.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.member_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
            <span className="text-xs font-bold text-forest">كشافين القسم</span>
          </div>
          <h1 className="text-2xl font-black text-forest">أعضاء ونطاق إشرافي الكشفي 🏕️</h1>
          <p className="text-xs text-charcoal/70">
            تظهر هذه القائمة حصراً الكشافة التابعين للأقسام والسنوات المعتمدة لنطاقك القيادي
          </p>
        </div>

        <Badge variant="emerald" size="md">
          {filteredMembers.length} كشاف مصرح به
        </Badge>
      </div>

      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ابحث بالاسم أو رقم القيد الكشفي في نطاقك..."
          className="w-full px-4 py-2.5 rounded-2xl border border-sand bg-white text-xs focus:border-emerald outline-none text-right pr-9 shadow-sm"
        />
        <Search className="w-4 h-4 text-charcoal/40 absolute right-3 top-3.5" />
      </div>

      <Card className="bg-white rounded-3xl border-sand scout-card-shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-sand/30 text-forest font-bold border-b border-sand/60">
              <tr>
                <th className="py-3 px-4">رقم القيد</th>
                <th className="py-3 px-4">اسم الكشاف</th>
                <th className="py-3 px-4">القسم الكشفي</th>
                <th className="py-3 px-4">السنة / الفوج</th>
                <th className="py-3 px-4">الالتزام</th>
                <th className="py-3 px-4">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand/40">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-charcoal/50">
                    لا يوجد أعضاء في نطاقك يطابقون البحث
                  </td>
                </tr>
              ) : (
                filteredMembers.map((m) => (
                  <tr key={m.id} className="hover:bg-cream/20 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-forest">{m.member_number}</td>
                    <td className="py-3 px-4 font-bold text-forest">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-forest/10 text-forest flex items-center justify-center font-bold">
                          {m.avatar_url ? (
                            <img src={m.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            <User className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <span>{m.full_name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="bg-sand/30 text-forest px-2.5 py-0.5 rounded-full text-[11px] font-bold">
                        {m.section?.name || m.stage_id}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-charcoal/70">{m.year?.name || 'عام'}</td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={m.initial_commitment === 'committed' ? 'emerald' : 'neutral'}
                        size="sm"
                      >
                        {m.initial_commitment === 'committed' ? 'ملتزم' : 'ظروف'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={m.is_active ? 'emerald' : 'neutral'} size="sm">
                        {m.is_active ? 'نشط' : 'معطل'}
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
