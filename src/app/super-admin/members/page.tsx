'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  Search,
  ArrowRight,
  User,
  Trash2,
  UserX,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import {
  getAdminMembersDataAction,
  getActiveScoutSectionsAction,
  toggleMemberActiveAction,
  deleteMemberPermanentAction,
} from '@/app/actions/scout-actions';
import { Profile, ScoutSection } from '@/types';

export default function SuperAdminMembersPage() {
  const [members, setMembers] = useState<Profile[]>([]);
  const [sections, setSections] = useState<ScoutSection[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [isLoading, setIsLoading] = useState(true);

  // Status notification
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Deactivation / Reactivation Modal
  const [toggleActiveTarget, setToggleActiveTarget] = useState<Profile | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  // Permanent Delete Modal
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [memData, secData] = await Promise.all([
        getAdminMembersDataAction(),
        getActiveScoutSectionsAction(),
      ]);
      setMembers(memData.members);
      setSections(secData);
    } catch (err) {
      console.error('Failed to load members', err);
      setStatusMessage({ type: 'error', text: 'فشل تحميل بيانات الأعضاء.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleConfirmToggleActive = async () => {
    if (!toggleActiveTarget) return;
    setIsToggling(true);
    setStatusMessage(null);
    try {
      const nextActive = !toggleActiveTarget.is_active;
      await toggleMemberActiveAction(toggleActiveTarget.id, nextActive);
      setStatusMessage({
        type: 'success',
        text: nextActive
          ? `تم إعادة تنشيط حساب الكشاف "${toggleActiveTarget.full_name}" بنجاح ✅`
          : `تم تعطيل حساب الكشاف "${toggleActiveTarget.full_name}" بنجاح 🔒`,
      });
      setToggleActiveTarget(null);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تغيير حالة الحساب.';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsToggling(false);
    }
  };

  const handleConfirmPermanentDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setStatusMessage(null);
    try {
      await deleteMemberPermanentAction(deleteTarget.id);
      setStatusMessage({
        type: 'success',
        text: `تم حذف الكشاف "${deleteTarget.full_name}" وسجلاته نهائيًا من النظام.`,
      });
      setDeleteTarget(null);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر حذف الكشاف نهائياً.';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.member_number.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSection =
      selectedSectionId === 'all' ||
      m.section_id === selectedSectionId ||
      m.stage_id === selectedSectionId;

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && m.is_active) ||
      (statusFilter === 'inactive' && !m.is_active);

    return matchesSearch && matchesSection && matchesStatus;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 pt-6 pb-12 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/super-admin"
              className="text-xs text-charcoal/60 hover:text-forest flex items-center gap-1 font-bold"
            >
              <span>لوحة الإدارة العامة</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <span className="text-xs text-charcoal/40">/</span>
            <span className="text-xs font-bold text-forest">سجل الأعضاء وإدارة الحسابات</span>
          </div>
          <h1 className="text-2xl font-black text-forest">دليل جميع الكشافة والأعضاء 🏕️</h1>
          <p className="text-xs text-charcoal/70">
            استعراض وبحث وتصفية كل كشاف مسجل، التحكم في حالة الحساب (تنشيط/تعطيل)، والحذف الآمن
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="orange" size="md">
            {filteredMembers.length} كشاف معروض
          </Badge>
        </div>
      </div>

      {/* Status Feedback Notification */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-2xl flex items-center justify-between text-xs font-bold ${
            statusMessage.type === 'success'
              ? 'bg-emerald/10 text-emerald border border-emerald/20'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="p-1 hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
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
            className="w-full px-3 py-2.5 rounded-2xl border border-sand bg-white text-xs font-bold text-forest focus:border-emerald outline-none text-right shadow-sm"
          >
            <option value="all">جميع الأقسام الكشفية</option>
            {sections.map((sec) => (
              <option key={sec.id} value={sec.id}>
                {sec.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-full px-3 py-2.5 rounded-2xl border border-sand bg-white text-xs font-bold text-forest focus:border-emerald outline-none text-right shadow-sm"
          >
            <option value="all">كافة الحالات (نشط ومعطل)</option>
            <option value="active">الحسابات النشطة فقط 🟢</option>
            <option value="inactive">الحسابات المعطلة فقط 🔒</option>
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
                <th className="py-3 px-4 text-center">إجراءات الحساب</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand/40">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-charcoal/50">
                    لا يوجد أعضاء مطابقون لمعايير البحث والتصفية
                  </td>
                </tr>
              ) : (
                filteredMembers.map((m) => (
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
                        {m.is_active ? 'نشط 🟢' : 'معطل 🔒'}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setToggleActiveTarget(m)}
                          className={`text-[11px] py-1 px-2.5 border ${
                            m.is_active
                              ? 'text-amber-800 border-amber-300 hover:bg-amber-50'
                              : 'text-emerald border-emerald/30 hover:bg-emerald/10'
                          }`}
                        >
                          {m.is_active ? (
                            <>
                              <UserX className="w-3 h-3 ml-1" />
                              <span>تعطيل</span>
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-3 h-3 ml-1" />
                              <span>تنشيط</span>
                            </>
                          )}
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteTarget(m)}
                          className="text-[11px] py-1 px-2 text-rose-700 border-rose-200 hover:bg-rose-50"
                          title="حذف نهائي للكشاف"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* TOGGLE ACTIVE CONFIRMATION MODAL */}
      <Modal
        isOpen={Boolean(toggleActiveTarget)}
        onClose={() => setToggleActiveTarget(null)}
        title={toggleActiveTarget?.is_active ? 'تأكيد تعطيل حساب الكشاف 🔒' : 'تأكيد تنشيط حساب الكشاف 🟢'}
      >
        <div className="space-y-4">
          <p className="text-xs text-charcoal/80 leading-relaxed">
            {toggleActiveTarget?.is_active ? (
              <>
                هل تريد تعطيل حساب الكشاف <strong className="text-forest">{toggleActiveTarget?.full_name}</strong> ({toggleActiveTarget?.member_number})؟
                <br />
                تعطيل الحساب يمنع الكشاف من تسجيل الدخول أو التحضير بماسح QR، مع <strong>الحفاظ الكامل على كافة سجلات حضوره وإنجازاته السابقة</strong> في أرشيف الفوج.
              </>
            ) : (
              <>
                هل تريد إعادة تنشيط حساب الكشاف <strong className="text-forest">{toggleActiveTarget?.full_name}</strong> ({toggleActiveTarget?.member_number})؟
                <br />
                سيعود الكشاف للظهور في قوائم الحضور والطلائع النشطة فورًا.
              </>
            )}
          </p>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-sand">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setToggleActiveTarget(null)}
              disabled={isToggling}
            >
              إلغاء
            </Button>
            <Button
              variant={toggleActiveTarget?.is_active ? 'secondary' : 'adventure'}
              size="sm"
              onClick={handleConfirmToggleActive}
              isLoading={isToggling}
              className={toggleActiveTarget?.is_active ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}
            >
              {toggleActiveTarget?.is_active ? 'نعم، تعطيل الحساب' : 'نعم، تنشيط الحساب'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* PERMANENT DELETE CONFIRMATION MODAL */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="تأكيد الحذف النهائي للكشاف ⚠️"
      >
        <div className="space-y-4">
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs leading-relaxed space-y-1">
            <p className="font-bold">تحذير أمني هام:</p>
            <p>
              أنت على وشك حذف الكشاف <strong className="underline">{deleteTarget?.full_name}</strong> (رقم القيد: {deleteTarget?.member_number}) نهائيًا من قاعدة البيانات.
            </p>
            <p className="text-[11px] text-rose-700">
              سيتم حذف بطاقة QR وسجلات الحضور والطلائع المرتبطة بهذا الحساب. هذا الإجراء نهائي ولا يمكن التراجع عنه.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-sand">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              إلغاء
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleConfirmPermanentDelete}
              isLoading={isDeleting}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              نعم، حذف الكشاف نهائيًا
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
