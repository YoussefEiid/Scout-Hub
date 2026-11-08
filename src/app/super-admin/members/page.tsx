'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  Search,
  ArrowRight,
  ShieldAlert,
  UserX,
  UserCheck,
  Trash2,
  KeyRound,
  Eye,
  AlertCircle,
  User,
  CheckCircle2,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import {
  getSuperAdminMembersAction,
  toggleMemberActiveAction,
  deleteMemberPermanentAction,
  resetScoutPasswordAction,
} from '@/app/actions/scout-actions';
import { getSectionDisplayName, getSectionYearDisplayName } from '@/lib/sections/section-helper';
import { Profile, ScoutSection } from '@/types';

export default function SuperAdminMembersPage() {
  const [members, setMembers] = useState<Profile[]>([]);
  const [sections, setSections] = useState<ScoutSection[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [isLoading, setIsLoading] = useState(true);

  // Toggle active status modal
  const [toggleActiveTarget, setToggleActiveTarget] = useState<Profile | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  // Permanent delete modal
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset password modal
  const [resetPasswordTarget, setResetPasswordTarget] = useState<Profile | null>(null);
  const [customPassword, setCustomPassword] = useState('');
  const [resetSuccessPassword, setResetSuccessPassword] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Feedback notification
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const data = await getSuperAdminMembersAction();
      setMembers(data.members);
      setSections(data.sections);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تحميل بيانات الأعضاء.';
      setStatusMessage({ type: 'error', text: msg });
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
      const newStatus = !toggleActiveTarget.is_active;
      await toggleMemberActiveAction(toggleActiveTarget.id, newStatus);
      setStatusMessage({
        type: 'success',
        text: newStatus
          ? `تم تنشيط حساب الكشاف "${toggleActiveTarget.full_name}" بنجاح 🟢`
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
    if (deleteConfirmText.trim() !== deleteTarget.member_number.trim()) {
      setStatusMessage({ type: 'error', text: 'رقم القيد المدخل للتأكيد غير مطابق لرقم الكشاف.' });
      return;
    }

    setIsDeleting(true);
    setStatusMessage(null);
    try {
      await deleteMemberPermanentAction(deleteTarget.id, deleteConfirmText.trim());
      setStatusMessage({
        type: 'success',
        text: `تم حذف الكشاف "${deleteTarget.full_name}" وسجلاته وحسابه نهائيًا من النظام.`,
      });
      setDeleteTarget(null);
      setDeleteConfirmText('');
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر حذف الكشاف نهائياً.';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetPasswordTarget) return;
    setIsResetting(true);
    setStatusMessage(null);
    try {
      const res = await resetScoutPasswordAction({
        memberId: resetPasswordTarget.id,
        newPassword: customPassword.trim() || undefined,
      });
      setResetSuccessPassword(res.newPassword || customPassword.trim());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر إعادة تعيين كلمة المرور.';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsResetting(false);
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
            إدارة الكشافة، تعديل وإعادة تعيين كلمات المرور، التحكم بالحالة (تنشيط/تعطيل)، والحذف الآمن
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="orange" size="md">
            {filteredMembers.length} كشاف معروض
          </Badge>
        </div>
      </div>

      {/* Status Notification Banner */}
      {statusMessage && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold ${
            statusMessage.type === 'success'
              ? 'bg-emerald/10 border border-emerald/30 text-emerald-dark'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-charcoal/40 hover:text-charcoal text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filters Card */}
      <Card className="bg-white rounded-3xl border-sand scout-card-shadow p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بالاسم أو برقم القيد (SCT-2026-XXXX)..."
              className="w-full pl-3 pr-9 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald outline-none text-right font-medium"
            />
            <Search className="w-4 h-4 text-charcoal/40 absolute right-3 top-2.5" />
          </div>

          {/* Section Filter */}
          <div>
            <select
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald outline-none text-right font-bold text-forest"
            >
              <option value="all">جميع الأقسام الكشفية</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald outline-none text-right font-bold text-forest"
            >
              <option value="all">جميع الحالات (النشط والمعطل)</option>
              <option value="active">الحسابات النشطة فقط 🟢</option>
              <option value="inactive">الحسابات المعطلة فقط 🔒</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Members Table */}
      <Card className="bg-white rounded-3xl border-sand scout-card-shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-cream/40 border-b border-sand text-forest font-black">
              <tr>
                <th className="py-3.5 px-4">رقم القيد</th>
                <th className="py-3.5 px-4">اسم الكشاف</th>
                <th className="py-3.5 px-4">القسم الكشفي</th>
                <th className="py-3.5 px-4">السنة / المستوى</th>
                <th className="py-3.5 px-4">الالتزام</th>
                <th className="py-3.5 px-4">الحالة</th>
                <th className="py-3.5 px-4 text-center">إدارة الكشاف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand/40 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-charcoal/50">
                    جاري تحميل سجل الأعضاء...
                  </td>
                </tr>
              ) : filteredMembers.length === 0 ? (
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
                        <div className="w-7 h-7 rounded-full bg-forest/10 text-forest flex items-center justify-center font-bold overflow-hidden">
                          {m.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <span className="font-bold text-forest">{m.full_name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="bg-sand/30 text-forest px-2.5 py-0.5 rounded-full text-[11px] font-bold">
                        {getSectionDisplayName(m)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-charcoal/70">
                      {getSectionYearDisplayName(m) || 'غير محدد'}
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
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        {/* Reset Password */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setResetPasswordTarget(m);
                            setResetSuccessPassword(null);
                            setCustomPassword('');
                          }}
                          className="text-[11px] py-1 px-2 text-charcoal/70 hover:text-forest"
                          title="إعادة تعيين كلمة مرور الكشاف"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </Button>

                        {/* Toggle Active */}
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

                        {/* Permanent Delete */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setDeleteTarget(m);
                            setDeleteConfirmText('');
                          }}
                          className="text-[11px] py-1 px-2 text-rose-700 border-rose-200 hover:bg-rose-50"
                          title="حذف نهائي للكشاف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* PERMANENT DELETE CONFIRMATION MODAL WITH MEMBER NUMBER VERIFICATION */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteConfirmText('');
        }}
        title="تأكيد الحذف النهائي للكشاف ⚠️"
      >
        <div className="space-y-4">
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs leading-relaxed space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>تحذير أمني هام — إجراء نهائي لا رجعة فيه:</span>
            </div>
            <p>
              أنت على وشك حذف الكشاف <strong className="underline">{deleteTarget?.full_name}</strong> (رقم القيد:{' '}
              <span className="font-mono font-bold text-rose-900">{deleteTarget?.member_number}</span>) نهائيًا من
              قاعدة البيانات والحساب الأمني.
            </p>
            <p className="text-[11px] text-rose-700">
              سيتم حذف بطاقة QR وسجلات الحضور والطلائع المرتبطة والحساب الأمني بالكامل.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-charcoal/80 mb-1">
              لتأكيد الحذف النهائي، اكتب رقم قيد الكشاف{' '}
              <strong className="font-mono text-rose-700">{deleteTarget?.member_number}</strong>:
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={deleteTarget?.member_number}
              dir="ltr"
              className="w-full px-3 py-2 border border-rose-300 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-rose-500 text-center font-bold"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-sand">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteConfirmText('');
              }}
              disabled={isDeleting}
            >
              إلغاء
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleConfirmPermanentDelete}
              isLoading={isDeleting}
              disabled={isDeleting || deleteConfirmText.trim() !== deleteTarget?.member_number.trim()}
              className="bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50"
            >
              نعم، حذف الكشاف نهائيًا
            </Button>
          </div>
        </div>
      </Modal>

      {/* RESET PASSWORD MODAL FOR CHILD ACCOUNTS */}
      <Modal
        isOpen={Boolean(resetPasswordTarget)}
        onClose={() => {
          setResetPasswordTarget(null);
          setResetSuccessPassword(null);
          setCustomPassword('');
        }}
        title={`إعادة تعيين كلمة مرور الكشاف 🔑`}
      >
        <div className="space-y-4">
          <p className="text-xs text-charcoal/80 leading-relaxed">
            يمكنك توليد كلمة مرور جديدة للكشاف <strong className="text-forest">{resetPasswordTarget?.full_name}</strong> ({resetPasswordTarget?.member_number}) لتمكينه من تسجيل الدخول.
          </p>

          {resetSuccessPassword ? (
            <div className="p-3 bg-emerald/10 border border-emerald/30 rounded-2xl text-xs space-y-2">
              <span className="font-bold text-emerald-dark block">
                تم تغيير كلمة المرور بنجاح! سلمها للكشاف أو ولي أمره:
              </span>
              <div className="p-2 bg-white rounded-xl border border-sand text-center font-mono font-black text-sm text-forest select-all">
                {resetSuccessPassword}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-charcoal/80 mb-1">
                كلمة المرور الجديدة (اتركها فارغة للتوليد التلقائي):
              </label>
              <input
                type="text"
                value={customPassword}
                onChange={(e) => setCustomPassword(e.target.value)}
                placeholder="توليد تلقائي آمن..."
                dir="ltr"
                className="w-full px-3 py-2 border border-sand rounded-xl text-xs font-mono text-center"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-sand">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setResetPasswordTarget(null);
                setResetSuccessPassword(null);
                setCustomPassword('');
              }}
            >
              {resetSuccessPassword ? 'تم الإغلاق' : 'إلغاء'}
            </Button>
            {!resetSuccessPassword && (
              <Button
                variant="adventure"
                size="sm"
                onClick={handleResetPassword}
                isLoading={isResetting}
              >
                تأكيد التعيين
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
