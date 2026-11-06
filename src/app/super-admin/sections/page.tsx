'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Compass,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Layers,
  ChevronDown,
  ChevronUp,
  Save,
  Calendar,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import {
  getScoutSectionsAdminAction,
  createScoutSectionAction,
  updateScoutSectionAction,
  createSectionYearAction,
  updateSectionYearAction,
} from '@/app/actions/scout-actions';
import { ScoutSection, ScoutSectionYear } from '@/types';

export default function ScoutSectionsManagementPage() {
  const [sections, setSections] = useState<ScoutSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);

  // Section Modal
  const [isSectionModalOpen, setIsSectionModalOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<ScoutSection | null>(null);
  const [sectionCode, setSectionCode] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [sectionDescription, setSectionDescription] = useState('');
  const [sectionColor, setSectionColor] = useState('#23836B');
  const [sectionOrder, setSectionOrder] = useState(1);

  // Year Modal
  const [isYearModalOpen, setIsYearModalOpen] = useState(false);
  const [targetSectionForYear, setTargetSectionForYear] = useState<ScoutSection | null>(null);
  const [editingYear, setEditingYear] = useState<ScoutSectionYear | null>(null);
  const [yearName, setYearName] = useState('');
  const [yearOrder, setYearOrder] = useState(1);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    try {
      const data = await getScoutSectionsAdminAction();
      setSections(data);
      if (data.length > 0 && !expandedSectionId) {
        setExpandedSectionId(data[0].id);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'تعذر تحميل الأقسام' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAddSectionModal = () => {
    setEditingSection(null);
    setSectionCode('');
    setSectionName('');
    setSectionDescription('');
    setSectionColor('#23836B');
    setSectionOrder(sections.length + 1);
    setIsSectionModalOpen(true);
  };

  const openEditSectionModal = (sec: ScoutSection) => {
    setEditingSection(sec);
    setSectionCode(sec.code);
    setSectionName(sec.name);
    setSectionDescription(sec.description || '');
    setSectionColor(sec.color_theme || '#23836B');
    setSectionOrder(sec.display_order);
    setIsSectionModalOpen(true);
  };

  const handleSaveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      if (editingSection) {
        await updateScoutSectionAction(editingSection.id, {
          name: sectionName.trim(),
          description: sectionDescription.trim() || null,
          color_theme: sectionColor,
          display_order: Number(sectionOrder),
        });
        setFeedback({ type: 'success', message: 'تم تحديث القسم الكشفي بنجاح' });
      } else {
        await createScoutSectionAction({
          code: sectionCode.trim().toLowerCase(),
          name: sectionName.trim(),
          description: sectionDescription.trim() || undefined,
          color_theme: sectionColor,
          display_order: Number(sectionOrder),
        });
        setFeedback({ type: 'success', message: 'تم إضافة القسم الكشفي الجديد بنجاح' });
      }
      setIsSectionModalOpen(false);
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'فشلت عملية حفظ القسم' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleSectionActive = async (sec: ScoutSection) => {
    try {
      await updateScoutSectionAction(sec.id, { is_active: !sec.is_active });
      setFeedback({
        type: 'success',
        message: `تم ${!sec.is_active ? 'تفعيل' : 'تعطيل'} قسم ${sec.name}`,
      });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'تعذر تغيير حالة القسم' });
    }
  };

  // Year Handlers
  const openAddYearModal = (sec: ScoutSection) => {
    setTargetSectionForYear(sec);
    setEditingYear(null);
    setYearName('');
    setYearOrder((sec.years?.length || 0) + 1);
    setIsYearModalOpen(true);
  };

  const openEditYearModal = (sec: ScoutSection, yr: ScoutSectionYear) => {
    setTargetSectionForYear(sec);
    setEditingYear(yr);
    setYearName(yr.name);
    setYearOrder(yr.display_order);
    setIsYearModalOpen(true);
  };

  const handleSaveYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetSectionForYear) return;
    setIsSubmitting(true);
    setFeedback(null);

    try {
      if (editingYear) {
        await updateSectionYearAction(editingYear.id, {
          name: yearName.trim(),
          display_order: Number(yearOrder),
        });
        setFeedback({ type: 'success', message: 'تم تعديل بيانات السنة الكشفية' });
      } else {
        await createSectionYearAction({
          section_id: targetSectionForYear.id,
          name: yearName.trim(),
          display_order: Number(yearOrder),
        });
        setFeedback({ type: 'success', message: 'تمت إضافة السنة الكشفية بنجاح' });
      }
      setIsYearModalOpen(false);
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'فشلت عملية حفظ السنة' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleYearActive = async (yr: ScoutSectionYear) => {
    try {
      await updateSectionYearAction(yr.id, { is_active: !yr.is_active });
      setFeedback({
        type: 'success',
        message: `تم ${!yr.is_active ? 'تفعيل' : 'تعطيل'} ${yr.name}`,
      });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'تعذر تغيير حالة السنة' });
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/super-admin" className="text-xs text-charcoal/60 hover:text-forest flex items-center gap-1 font-bold">
              <span>لوحة الإدارة العامة</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <span className="text-xs text-charcoal/40">/</span>
            <span className="text-xs font-bold text-forest">الأقسام والسنوات</span>
          </div>
          <h1 className="text-2xl font-black text-forest">إدارة الهيكل الكشفي الديناميكي 🏕️</h1>
          <p className="text-xs text-charcoal/70">
            أضف أو عدّل الأقسام الكشفية وسنوات كل مرحلة بدون حدود أو قيود مسبقة
          </p>
        </div>

        <Button variant="adventure" size="md" onClick={openAddSectionModal} className="flex items-center gap-1.5 shadow-md">
          <Plus className="w-4 h-4" />
          <span>إضافة قسم كشفي جديد</span>
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

      {/* Sections Accordion List */}
      <div className="space-y-4">
        {sections.map((sec) => {
          const isExpanded = expandedSectionId === sec.id;
          const years = sec.years || [];

          return (
            <Card key={sec.id} className="bg-white rounded-3xl border-sand scout-card-shadow overflow-hidden">
              {/* Section Header Row */}
              <div
                className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-cream/20 transition-colors"
                onClick={() => setExpandedSectionId(isExpanded ? null : sec.id)}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold shadow-sm"
                    style={{ backgroundColor: sec.color_theme || '#23836B' }}
                  >
                    <Compass className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-forest">{sec.name}</h3>
                      <span className="text-[11px] font-mono text-charcoal/50 bg-sand/30 px-2 py-0.5 rounded-full">
                        {sec.code}
                      </span>
                      <Badge variant={sec.is_active ? 'emerald' : 'neutral'} size="sm">
                        {sec.is_active ? 'نشط' : 'معطل'}
                      </Badge>
                    </div>
                    {sec.description && (
                      <p className="text-xs text-charcoal/60 mt-0.5">{sec.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleToggleSectionActive(sec)}
                    title={sec.is_active ? 'تعطيل القسم' : 'تفعيل القسم'}
                    className="text-xs px-2.5 py-1 rounded-xl bg-sand/30 hover:bg-sand/60 text-forest font-bold transition-colors"
                  >
                    {sec.is_active ? 'تعطيل' : 'تفعيل'}
                  </button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditSectionModal(sec)}
                    className="text-xs flex items-center gap-1"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>تعديل</span>
                  </Button>
                  <button
                    onClick={() => setExpandedSectionId(isExpanded ? null : sec.id)}
                    className="p-1.5 rounded-xl hover:bg-sand/40 text-charcoal/60"
                  >
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Sub-Years List when Expanded */}
              {isExpanded && (
                <div className="bg-cream/30 p-5 border-t border-sand/40 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-forest flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-orange" />
                      <span>السنوات والمستويات الكشفية داخل قسم {sec.name}:</span>
                    </span>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => openAddYearModal(sec)}
                      className="text-xs flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة سنة / فوج</span>
                    </Button>
                  </div>

                  {years.length === 0 ? (
                    <p className="text-xs text-charcoal/60 py-3 text-center bg-white rounded-2xl border border-dashed border-sand">
                      لا توجد سنوات كشفية مضافة لهذا القسم بعد. أضف السنة الأولى.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                      {years.map((yr) => (
                        <div
                          key={yr.id}
                          className="p-3 bg-white rounded-2xl border border-sand/80 flex items-center justify-between shadow-sm"
                        >
                          <div>
                            <span className="text-xs font-bold text-forest block">{yr.name}</span>
                            <span className="text-[10px] text-charcoal/50">
                              الترتيب: {yr.display_order} • {yr.is_active ? 'نشط' : 'معطل'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleToggleYearActive(yr)}
                              className="text-[10px] px-2 py-0.5 rounded-lg bg-sand/30 hover:bg-sand/60 text-forest font-bold"
                            >
                              {yr.is_active ? 'تعطيل' : 'تفعيل'}
                            </button>
                            <button
                              onClick={() => openEditYearModal(sec, yr)}
                              className="p-1 rounded-lg hover:bg-sand/40 text-charcoal/60"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Section Create/Edit Modal */}
      <Modal
        isOpen={isSectionModalOpen}
        onClose={() => setIsSectionModalOpen(false)}
        title={editingSection ? 'تعديل القسم الكشفي' : 'إضافة قسم كشفي جديد'}
      >
        <form onSubmit={handleSaveSection} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-charcoal/80 mb-1">اسم القسم الكشفي بالعربية *</label>
            <input
              type="text"
              required
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              placeholder="مثال: المرشدات أو الجوالة"
              className="w-full px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald outline-none text-right"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-charcoal/80 mb-1">
              الرمز الكودي الفريد (Code بالإنجليزية) *
            </label>
            <input
              type="text"
              required
              disabled={Boolean(editingSection)}
              value={sectionCode}
              onChange={(e) => setSectionCode(e.target.value)}
              placeholder="مثال: guides أو rovers"
              className="w-full px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald outline-none text-right font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-charcoal/80 mb-1">وصف المرحلة أو الفئة العمرية</label>
            <input
              type="text"
              value={sectionDescription}
              onChange={(e) => setSectionDescription(e.target.value)}
              placeholder="مثال: من سن 12 إلى 15 سنة"
              className="w-full px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald outline-none text-right"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-charcoal/80 mb-1">لون التمييز (Color Hex)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={sectionColor}
                  onChange={(e) => setSectionColor(e.target.value)}
                  className="w-9 h-9 rounded-xl border border-sand p-0 cursor-pointer"
                />
                <span className="text-xs font-mono">{sectionColor}</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-charcoal/80 mb-1">ترتيب العرض</label>
              <input
                type="number"
                min="1"
                value={sectionOrder}
                onChange={(e) => setSectionOrder(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald outline-none text-right"
              />
            </div>
          </div>

          <div className="pt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={() => setIsSectionModalOpen(false)}>
              إلغاء
            </Button>
            <Button variant="adventure" size="sm" type="submit" isLoading={isSubmitting}>
              <span>{editingSection ? 'حفظ التعديلات' : 'إضافة القسم'}</span>
            </Button>
          </div>
        </form>
      </Modal>

      {/* Year Create/Edit Modal */}
      <Modal
        isOpen={isYearModalOpen}
        onClose={() => setIsYearModalOpen(false)}
        title={editingYear ? 'تعديل السنة الكشفية' : `إضافة سنة كشفية لقسم ${targetSectionForYear?.name}`}
      >
        <form onSubmit={handleSaveYear} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-charcoal/80 mb-1">اسم السنة / المستوى بالعربية *</label>
            <input
              type="text"
              required
              value={yearName}
              onChange={(e) => setYearName(e.target.value)}
              placeholder="مثال: السنة الرابعة أو فوج المستجدين"
              className="w-full px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald outline-none text-right"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-charcoal/80 mb-1">ترتيب العرض</label>
            <input
              type="number"
              min="1"
              value={yearOrder}
              onChange={(e) => setYearOrder(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald outline-none text-right"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={() => setIsYearModalOpen(false)}>
              إلغاء
            </Button>
            <Button variant="adventure" size="sm" type="submit" isLoading={isSubmitting}>
              <span>{editingYear ? 'حفظ التعديلات' : 'إضافة السنة'}</span>
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
