'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  UserCheck,
  Plus,
  ShieldAlert,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Layers,
  Compass,
  Calendar,
  Lock,
  Mail,
  User,
  Power,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import {
  getSuperAdminLeadersAction,
  createLeaderAccountAction,
  assignLeaderScopeAction,
  revokeLeaderScopeAction,
  toggleUserActiveAction,
} from '@/app/actions/scout-actions';
import { ScoutSection, ScoutSectionYear, StaffScopeAssignment, UserRoleType } from '@/types';

interface LeaderItem {
  userId: string;
  role: UserRoleType;
  roleCreatedAt: string;
  profile: {
    id: string;
    member_number: string;
    full_name: string;
    phone?: string | null;
    is_active: boolean;
    avatar_url?: string | null;
  } | null;
  scopes: StaffScopeAssignment[];
}

export default function LeaderManagementPage() {
  const [leaders, setLeaders] = useState<LeaderItem[]>([]);
  const [sections, setSections] = useState<ScoutSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Create Leader Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [leaderFullName, setLeaderFullName] = useState('');
  const [leaderEmail, setLeaderEmail] = useState('');
  const [leaderPassword, setLeaderPassword] = useState('');
  const [leaderRole, setLeaderRole] = useState<'section_leader' | 'assistant_leader'>('section_leader');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [selectedYearId, setSelectedYearId] = useState<string>(''); // empty string = all years

  // Assign Scope Modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [targetLeader, setTargetLeader] = useState<LeaderItem | null>(null);
  const [scopeSectionId, setScopeSectionId] = useState('');
  const [scopeYearId, setScopeYearId] = useState('');

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    try {
      const data = await getSuperAdminLeadersAction();
      setLeaders(data.leaders as LeaderItem[]);
      setSections(data.sections);
      if (data.sections.length > 0) {
        setSelectedSectionId(data.sections[0].id);
        setScopeSectionId(data.sections[0].id);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'تعذر تحميل بيانات القادة' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setLeaderFullName('');
    setLeaderEmail('');
    setLeaderPassword('');
    setLeaderRole('section_leader');
    if (sections.length > 0) {
      setSelectedSectionId(sections[0].id);
    }
    setSelectedYearId('');
    setIsCreateModalOpen(true);
  };

  const handleCreateLeader = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      await createLeaderAccountAction({
        fullName: leaderFullName.trim(),
        email: leaderEmail.trim(),
        password: leaderPassword || undefined,
        role: leaderRole,
        sectionId: selectedSectionId,
        yearId: selectedYearId || null,
      });

      setFeedback({ type: 'success', message: 'تم إنشاء حساب القائد وتكليفه بالنطاق بنجاح 🏕️' });
      setIsCreateModalOpen(false);
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'فشلت عملية إنشاء القائد' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openAssignScopeModal = (ldr: LeaderItem) => {
    setTargetLeader(ldr);
    if (sections.length > 0) {
      setScopeSectionId(sections[0].id);
    }
    setScopeYearId('');
    setIsAssignModalOpen(true);
  };

  const handleAssignScope = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetLeader) return;
    setIsSubmitting(true);
    setFeedback(null);

    try {
      await assignLeaderScopeAction({
        userId: targetLeader.userId,
        sectionId: scopeSectionId,
        yearId: scopeYearId || null,
      });
      setFeedback({ type: 'success', message: 'تمت إضافة نطاق الإشراف الجديد للقائد' });
      setIsAssignModalOpen(false);
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'فشل تكليف النطاق' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeScope = async (assignmentId: string) => {
    const confirm = window.confirm('هل تريد إلغاء هذا النطاق من صلاحيات القائد؟');
    if (!confirm) return;

    try {
      await revokeLeaderScopeAction(assignmentId);
      setFeedback({ type: 'success', message: 'تم إلغاء نطاق الإشراف بنجاح' });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'فشل إلغاء النطاق' });
    }
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    const confirm = window.confirm(
      `هل تريد ${currentActive ? 'تعطيل' : 'إعادة تفعيل'} هذا الحساب؟`
    );
    if (!confirm) return;

    try {
      await toggleUserActiveAction(userId, !currentActive);
      setFeedback({
        type: 'success',
        message: `تم ${!currentActive ? 'تفعيل' : 'تعطيل'} حساب القائد بنجاح`,
      });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'تعذر تغيير حالة الحساب' });
    }
  };

  const currentSectionForModal = sections.find((s) => s.id === selectedSectionId);
  const currentYearsForModal = currentSectionForModal?.years || [];

  const currentScopeSection = sections.find((s) => s.id === scopeSectionId);
  const currentScopeYears = currentScopeSection?.years || [];

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
            <span className="text-xs font-bold text-forest">حسابات القادة والصلاحيات</span>
          </div>
          <h1 className="text-2xl font-black text-forest">إدارة القادة ونطاقات الإشراف 🏕️</h1>
          <p className="text-xs text-charcoal/70">
            إنشاء حسابات القادة وتعيين الصلاحيات الصارمة لكل قائد على قسم محدد أو سنة معينة
          </p>
        </div>

        <Button variant="adventure" size="md" onClick={openCreateModal} className="flex items-center gap-1.5 shadow-md">
          <Plus className="w-4 h-4" />
          <span>إنشاء / دعوة قائد جديد</span>
        </Button>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Leaders Table Card */}
      <Card className="bg-white rounded-3xl border-sand scout-card-shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-sand/30 text-forest font-bold border-b border-sand/60">
              <tr>
                <th className="py-3 px-4">القائد</th>
                <th className="py-3 px-4">الرتبة والدور</th>
                <th className="py-3 px-4">نطاقات الإشراف المصرح بها (Scopes)</th>
                <th className="py-3 px-4">الحالة</th>
                <th className="py-3 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand/40">
              {leaders.map((ldr) => {
                const isActive = ldr.profile?.is_active ?? true;
                const isSuper = ldr.role === 'super_admin';

                return (
                  <tr key={ldr.userId} className="hover:bg-cream/20 transition-colors">
                    {/* Leader Profile Info */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-forest/10 text-forest flex items-center justify-center font-bold">
                          {ldr.profile?.avatar_url ? (
                            <img
                              src={ldr.profile.avatar_url}
                              alt=""
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            <User className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <span className="font-bold text-forest block">
                            {ldr.profile?.full_name || 'قائد بدون اسم'}
                          </span>
                          <span className="text-[10px] text-charcoal/50 font-mono">
                            {ldr.profile?.member_number || ldr.userId.slice(0, 8)}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="py-3.5 px-4">
                      {isSuper ? (
                        <Badge variant="danger" size="sm">
                          القائد العام (Super Admin)
                        </Badge>
                      ) : ldr.role === 'section_leader' || ldr.role === 'admin' ? (
                        <Badge variant="emerald" size="sm">
                          قائد مرحلة (Section Leader)
                        </Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">
                          مساعد قائد (Assistant)
                        </Badge>
                      )}
                    </td>

                    {/* Scopes */}
                    <td className="py-3.5 px-4">
                      {isSuper ? (
                        <span className="text-[11px] text-emerald-dark font-bold bg-emerald/10 px-2.5 py-1 rounded-full border border-emerald/20">
                          صلاحية شاملة على كل الأقسام
                        </span>
                      ) : ldr.scopes.length === 0 ? (
                        <span className="text-[11px] text-red-600 bg-red-50 px-2 py-0.5 rounded-full font-bold">
                          لا يوجد نطاق مخصص (معلق)
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {ldr.scopes.map((sc) => (
                            <span
                              key={sc.id}
                              className="inline-flex items-center gap-1 text-[11px] bg-sand/30 text-forest px-2.5 py-0.5 rounded-full border border-sand/60 font-semibold"
                            >
                              <span>{sc.section?.name || 'قسم'}</span>
                              {sc.year?.name ? (
                                <span className="text-orange font-bold">({sc.year.name})</span>
                              ) : (
                                <span className="text-emerald font-bold">(كل السنوات)</span>
                              )}
                              <button
                                onClick={() => handleRevokeScope(sc.id)}
                                title="إلغاء هذا النطاق"
                                className="text-red-500 hover:text-red-700 ml-0.5"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <Badge variant={isActive ? 'emerald' : 'neutral'} size="sm">
                        {isActive ? 'نشط' : 'معطل'}
                      </Badge>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-center">
                      {!isSuper && (
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAssignScopeModal(ldr)}
                            className="text-[11px] px-2 py-1"
                          >
                            <span>+ إضافة نطاق</span>
                          </Button>
                          <button
                            onClick={() => handleToggleActive(ldr.userId, isActive)}
                            title={isActive ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                            className={`p-1.5 rounded-xl transition-colors ${
                              isActive
                                ? 'text-red-500 hover:bg-red-50'
                                : 'text-emerald hover:bg-emerald-50'
                            }`}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Leader Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="إنشاء حساب قائد كشفي وتكليفه بالنطاق"
      >
        <form onSubmit={handleCreateLeader} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-charcoal/80 mb-1">اسم القائد الكامل *</label>
            <input
              type="text"
              required
              value={leaderFullName}
              onChange={(e) => setLeaderFullName(e.target.value)}
              placeholder="الاسم الرباعي للقائد"
              className="w-full px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald outline-none text-right"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-charcoal/80 mb-1">البريد الإلكتروني للقيادة *</label>
            <input
              type="email"
              required
              value={leaderEmail}
              onChange={(e) => setLeaderEmail(e.target.value)}
              placeholder="leader@alfanar-scouts.com"
              className="w-full px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald outline-none text-right font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-charcoal/80 mb-1">كلمة المرور الأولية (أو اتركها للافتراضية)</label>
            <input
              type="password"
              value={leaderPassword}
              onChange={(e) => setLeaderPassword(e.target.value)}
              placeholder="ScoutLeader2026!"
              className="w-full px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald outline-none text-right font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-charcoal/80 mb-1">الدور الكشفي والصلاحية *</label>
            <select
              value={leaderRole}
              onChange={(e) => setLeaderRole(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald outline-none text-right"
            >
              <option value="section_leader">قائد مرحلة (Section Leader — كامل صلاحيات القسم والفرق)</option>
              <option value="assistant_leader">مساعد قائد (Assistant Leader — ماسح حضور وقراءة السجلات)</option>
            </select>
          </div>

          {/* Scope Assignment in Creation */}
          <div className="p-3.5 rounded-2xl bg-sand/20 border border-sand space-y-3">
            <span className="text-xs font-bold text-forest block">نطاق الإشراف الابتدائي المعتمد:</span>

            <div>
              <label className="block text-[11px] font-bold text-charcoal/80 mb-1">القسم الكشفي *</label>
              <select
                value={selectedSectionId}
                onChange={(e) => setSelectedSectionId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-sand bg-white text-xs focus:border-emerald outline-none text-right"
              >
                {sections.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    {sec.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-charcoal/80 mb-1">
                سنة محددة داخل القسم (اختياري)
              </label>
              <select
                value={selectedYearId}
                onChange={(e) => setSelectedYearId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-sand bg-white text-xs focus:border-emerald outline-none text-right"
              >
                <option value="">جميع سنوات هذا القسم (كامل المرحلة)</option>
                {currentYearsForModal.map((yr) => (
                  <option key={yr.id} value={yr.id}>
                    {yr.name} فقط
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={() => setIsCreateModalOpen(false)}>
              إلغاء
            </Button>
            <Button variant="adventure" size="sm" type="submit" isLoading={isSubmitting}>
              <span>إنشاء الحساب وتكليف النطاق</span>
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Scope Modal */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title={`إضافة نطاق إشراف جديد للقائد: ${targetLeader?.profile?.full_name}`}
      >
        <form onSubmit={handleAssignScope} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-charcoal/80 mb-1">القسم الكشفي *</label>
            <select
              value={scopeSectionId}
              onChange={(e) => setScopeSectionId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald outline-none text-right"
            >
              {sections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-charcoal/80 mb-1">السنة الكشفية</label>
            <select
              value={scopeYearId}
              onChange={(e) => setScopeYearId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald outline-none text-right"
            >
              <option value="">جميع سنوات هذا القسم (كامل المرحلة)</option>
              {currentScopeYears.map((yr) => (
                <option key={yr.id} value={yr.id}>
                  {yr.name} فقط
                </option>
              ))}
            </select>
          </div>

          <div className="pt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={() => setIsAssignModalOpen(false)}>
              إلغاء
            </Button>
            <Button variant="adventure" size="sm" type="submit" isLoading={isSubmitting}>
              <span>تأكيد إضافة النطاق</span>
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
