'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  Search,
  Filter,
  ArrowRight,
  ShieldCheck,
  User,
  QrCode,
  Layers,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { getAdminMembersDataAction, getActiveScoutSectionsAction } from '@/app/actions/scout-actions';
import { Profile, ScoutSection } from '@/types';

export default function SuperAdminMembersPage() {
  const [members, setMembers] = useState<Profile[]>([]);
  const [sections, setSections] = useState<ScoutSection[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [memData, secData] = await Promise.all([
          getAdminMembersDataAction(),
          getActiveScoutSectionsAction(),
        ]);
        setMembers(memData.members);
        setSections(secData);
      } catch (err) {
        console.error('Failed to load members', err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.member_number.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSection =
      selectedSectionId === 'all' ||
      m.section_id === selectedSectionId ||
      m.stage_id === selectedSectionId;

    return matchesSearch && matchesSection;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/super-admin" className="text-xs text-charcoal/60 hover:text-forest flex items-center gap-1 font-bold">
              <span>لوحة الإدارة العامة</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <span className="text-xs text-charcoal/40">/</span>
            <span className="text-xs font-bold text-forest">سجل الأعضاء</span>
          </div>
          <h1 className="text-2xl font-black text-forest">دليل جميع الكشافة والأعضاء 🏕️</h1>
          <p className="text-xs text-charcoal/70">
            استعراض وبحث وتصفية كل كشاف مسجل في النظام عبر كافة الأقسام والمراحل
          </p>
        </div>

        <Badge variant="orange" size="md">
          {filteredMembers.length} كشاف معروض
        </Badge>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative sm:col-span-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث بالاسم الكامل أو رقم القيد الكشفي..."
            className="w-full px-4 py-2.5 rounded-2xl border border-sand bg-white text-xs focus:border-emerald outline-none text-right pr-9 shadow-sm"
          />
          <Search className="w-4 h-4 text-charcoal/40 absolute right-3 top-3.5" />
        </div>

        <div>
          <select
            value={selectedSectionId}
            onChange={(e) => setSelectedSectionId(e.target.value)}
            className="w-full px-4 py-2.5 rounded-2xl border border-sand bg-white text-xs focus:border-emerald outline-none text-right shadow-sm"
          >
            <option value="all">جميع الأقسام الكشفية</option>
            {sections.map((sec) => (
              <option key={sec.id} value={sec.id}>
                {sec.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Members Directory Table */}
      <Card className="bg-white rounded-3xl border-sand scout-card-shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-sand/30 text-forest font-bold border-b border-sand/60">
              <tr>
                <th className="py-3 px-4">رقم القيد</th>
                <th className="py-3 px-4">اسم الكشاف</th>
                <th className="py-3 px-4">القسم الكشفي</th>
                <th className="py-3 px-4">السنة / المستوى</th>
                <th className="py-3 px-4">الالتزام</th>
                <th className="py-3 px-4">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand/40">
              {filteredMembers.map((m) => (
                <tr key={m.id} className="hover:bg-cream/20 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-bold text-forest">
                    {m.member_number}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-forest/10 text-forest flex items-center justify-center font-bold">
                        {m.avatar_url ? (
                          <img src={m.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <User className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <span className="font-bold text-forest">{m.full_name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="bg-sand/30 text-forest px-2.5 py-0.5 rounded-full text-[11px] font-bold">
                      {m.section?.name || m.stage_id || 'عام'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-charcoal/70">
                    {m.year?.name || 'غير محدد'}
                  </td>
                  <td className="py-3.5 px-4">
                    <Badge
                      variant={
                        m.initial_commitment === 'committed'
                          ? 'emerald'
                          : m.initial_commitment === 'circumstances'
                          ? 'orange'
                          : 'neutral'
                      }
                      size="sm"
                    >
                      {m.initial_commitment === 'committed'
                        ? 'ملتزم'
                        : m.initial_commitment === 'circumstances'
                        ? 'ظروف خاصة'
                        : 'غير ملتزم'}
                    </Badge>
                  </td>
                  <td className="py-3.5 px-4">
                    <Badge variant={m.is_active ? 'emerald' : 'neutral'} size="sm">
                      {m.is_active ? 'نشط' : 'معطل'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
