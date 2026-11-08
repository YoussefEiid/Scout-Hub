'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Download,
  Users,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Calendar,
  Plus,
  Play,
  Square,
  Edit,
  Trash2,
  QrCode,
  Search,
  X,
} from 'lucide-react';
import { FridaySession, AttendanceRecord, ScoutSection, UniformStatus } from '@/types';
import {
  exportAttendanceCSVAction,
  getAdminReportsDataAction,
  getFridayMeetingsAdminAction,
  createFridayMeetingAction,
  updateFridayMeetingAction,
  toggleMeetingAttendanceAction,
  deleteFridayMeetingAction,
  deleteAttendanceRecordAction,
  updateAttendanceUniformAction,
  getActiveScoutSectionsAction,
} from '@/app/actions/scout-actions';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';

// Helper to calculate upcoming Friday in Cairo
function getNextFridayDateString(): string {
  const now = new Date();
  const day = now.getDay();
  // Friday is 5
  let daysUntilFriday = (5 - day + 7) % 7;
  if (daysUntilFriday === 0 && now.getHours() >= 18) {
    daysUntilFriday = 7;
  }
  const nextFriday = new Date(now.getTime() + daysUntilFriday * 86400000);
  const year = nextFriday.getFullYear();
  const month = String(nextFriday.getMonth() + 1).padStart(2, '0');
  const date = String(nextFriday.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

export default function SuperAdminAttendancePage() {
  const [sessions, setSessions] = useState<FridaySession[]>([]);
  const [sections, setSections] = useState<ScoutSection[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'sessions' | 'records'>('sessions');

  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filter states
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchAttendee, setSearchAttendee] = useState<string>('');

  // Meeting Create/Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<FridaySession | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form Fields
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formSectionId, setFormSectionId] = useState<string>('');
  const [formYearId, setFormYearId] = useState<string>('');
  const [formStartTime, setFormStartTime] = useState('08:30');
  const [formLateThreshold, setFormLateThreshold] = useState('08:45');
  const [formIsOpen, setFormIsOpen] = useState(false);
  const [formNotes, setFormNotes] = useState('');

  // Delete Confirm Modal State
  const [deleteSessionConfirmId, setDeleteSessionConfirmId] = useState<string | null>(null);
  const [deleteRecordConfirmId, setDeleteRecordConfirmId] = useState<string | null>(null);

  const loadData = async (targetSessionId?: string) => {
    try {
      setIsLoading(true);
      const [meetingsRes, sectionsRes] = await Promise.all([
        getFridayMeetingsAdminAction(),
        getActiveScoutSectionsAction(),
      ]);

      const loadedSessions = meetingsRes.sessions || [];
      setSessions(loadedSessions);
      setSections(sectionsRes || []);

      const chosenId =
        targetSessionId ||
        selectedSessionId ||
        loadedSessions.find((s) => s.is_open_for_attendance)?.id ||
        loadedSessions[0]?.id ||
        '';

      setSelectedSessionId(chosenId);

      if (chosenId) {
        const reportRes = await getAdminReportsDataAction(chosenId);
        setRecords(reportRes.records || []);
      } else {
        setRecords([]);
      }
    } catch (err) {
      console.error('Failed to load attendance data:', err);
      setStatusMessage({ type: 'error', text: 'فشل تحميل بيانات اجتماعات الجمعة' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSessionChange = async (id: string) => {
    setSelectedSessionId(id);
    try {
      const data = await getAdminReportsDataAction(id);
      setRecords(data.records || []);
    } catch (err) {
      console.error('Failed to load session records', err);
    }
  };

  const handleToggleAttendance = async (session: FridaySession) => {
    const nextState = !session.is_open_for_attendance;
    try {
      await toggleMeetingAttendanceAction(session.id, nextState);
      setStatusMessage({
        type: 'success',
        text: nextState
          ? `تم فتح باب الحضور لاجتماع "${session.title}" بنجاح 🟢`
          : `تم إغلاق باب الحضور لاجتماع "${session.title}" 🔒`,
      });
      await loadData(session.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تغيير حالة الحضور';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  const openCreateModal = () => {
    setEditingSession(null);
    const defaultDate = getNextFridayDateString();
    setFormTitle(`اجتماع الجمعة الكشفي — ${defaultDate}`);
    setFormDate(defaultDate);
    setFormSectionId('');
    setFormYearId('');
    setFormStartTime('08:30');
    setFormLateThreshold('08:45');
    setFormIsOpen(false);
    setFormNotes('');
    setIsModalOpen(true);
  };

  const openEditModal = (session: FridaySession) => {
    setEditingSession(session);
    setFormTitle(session.title);
    setFormDate(session.session_date);
    setFormSectionId(session.section_id || '');
    setFormYearId(session.year_id || '');
    setFormStartTime(session.start_time.slice(0, 5));
    setFormLateThreshold(session.late_threshold_time.slice(0, 5));
    setFormIsOpen(session.is_open_for_attendance);
    setFormNotes(session.notes || '');
    setIsModalOpen(true);
  };

  const handleSaveMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formDate) {
      alert('يرجى ملء جميع الحقول الإلزامية');
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);
    try {
      if (editingSession) {
        await updateFridayMeetingAction(editingSession.id, {
          title: formTitle.trim(),
          session_date: formDate,
          section_id: formSectionId || null,
          year_id: formYearId || null,
          start_time: `${formStartTime}:00`,
          late_threshold_time: `${formLateThreshold}:00`,
          notes: formNotes.trim() || null,
        });
        setStatusMessage({ type: 'success', text: 'تم تحديث بيانات الاجتماع بنجاح ✅' });
        setIsModalOpen(false);
        await loadData(editingSession.id);
      } else {
        const res = await createFridayMeetingAction({
          title: formTitle.trim(),
          session_date: formDate,
          section_id: formSectionId || null,
          year_id: formYearId || null,
          start_time: `${formStartTime}:00`,
          late_threshold_time: `${formLateThreshold}:00`,
          is_open_for_attendance: formIsOpen,
          notes: formNotes.trim() || null,
        });
        setStatusMessage({ type: 'success', text: 'تم إنشاء اجتماع الجمعة الجديد بنجاح 🏕️' });
        setIsModalOpen(false);
        await loadData(res.session.id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ الاجتماع';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteMeeting = async (sessionId: string) => {
    try {
      await deleteFridayMeetingAction(sessionId);
      setStatusMessage({ type: 'success', text: 'تم حذف الاجتماع وسجلاته بنجاح' });
      setDeleteSessionConfirmId(null);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر حذف الاجتماع';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    try {
      await deleteAttendanceRecordAction(recordId, 'إلغاء الحضور بواسطة الإدارة العامة');
      setStatusMessage({ type: 'success', text: 'تم إلغاء تسجيل حضور الكشاف بنجاح' });
      setDeleteRecordConfirmId(null);
      if (selectedSessionId) {
        const data = await getAdminReportsDataAction(selectedSessionId);
        setRecords(data.records || []);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر إلغاء الحضور';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  const handleToggleUniform = async (record: AttendanceRecord) => {
    const nextStatus: UniformStatus =
      record.uniform_status === 'with_uniform' ? 'without_uniform' : 'with_uniform';
    try {
      await updateAttendanceUniformAction(record.id, nextStatus);
      setRecords((prev) =>
        prev.map((r) => (r.id === record.id ? { ...r, uniform_status: nextStatus } : r))
      );
    } catch (err) {
      console.error('Failed to toggle uniform status', err);
    }
  };

  const handleExportCSV = async () => {
    if (!selectedSessionId) return;
    setIsExporting(true);
    try {
      const csvContent = await exportAttendanceCSVAction(selectedSessionId);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `scout-attendance-${selectedSessionId}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('حدث خطأ أثناء تصدير التقرير');
    } finally {
      setIsExporting(false);
    }
  };

  // Filtered Sessions
  const filteredSessions = sessions.filter((s) => {
    const matchesSection =
      sectionFilter === 'all' ||
      s.section_id === sectionFilter ||
      (!s.section_id && sectionFilter === 'general');

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'open' && s.is_open_for_attendance) ||
      (statusFilter === 'closed' && !s.is_open_for_attendance && s.status !== 'cancelled') ||
      s.status === statusFilter;

    return matchesSection && matchesStatus;
  });

  // Selected Session
  const currentSession = sessions.find((s) => s.id === selectedSessionId) || sessions[0] || null;

  // Filtered Attendees
  const filteredRecords = records.filter((r) => {
    if (!searchAttendee.trim()) return true;
    const term = searchAttendee.toLowerCase();
    const nameMatch = r.member?.full_name?.toLowerCase().includes(term);
    const numMatch = r.member?.member_number?.toLowerCase().includes(term);
    return nameMatch || numMatch;
  });

  // KPIs
  const totalAttendees = records.length;
  const uniformAttendees = records.filter((r) => r.uniform_status === 'with_uniform').length;
  const onTimeAttendees = records.filter((r) => r.arrival_status === 'on_time').length;
  const lateAttendees = records.filter((r) => r.arrival_status === 'late').length;
  const uniformPercentage = totalAttendees > 0 ? Math.round((uniformAttendees / totalAttendees) * 100) : 0;

  // Selected Section for Form Years
  const selectedFormSection = sections.find((sec) => sec.id === formSectionId);
  const availableFormYears = selectedFormSection?.years || [];

  return (
    <div className="max-w-6xl mx-auto px-4 pt-6 pb-12 space-y-6">
      {/* Top Header */}
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
            <span className="text-xs font-bold text-forest">إدارة اجتماعات الجمعة والحضور</span>
          </div>
          <h1 className="text-2xl font-black text-forest">إدارة اجتماعات الجمعة والحضور 🏕️</h1>
          <p className="text-xs text-charcoal/70">
            إنشاء وجدولة وتفعيل اجتماعات الجمعة، التحكم في ماسح QR، ومتابعة سجلات الحضور المباشرة
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="adventure"
            size="sm"
            onClick={openCreateModal}
            className="flex items-center gap-1.5 shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة اجتماع جديد</span>
          </Button>

          <Link href="/leader/scanner">
            <Button variant="outline" size="sm" className="flex items-center gap-1.5 bg-white text-forest border-forest/20">
              <QrCode className="w-4 h-4 text-orange" />
              <span>فتح ماسح QR</span>
            </Button>
          </Link>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            isLoading={isExporting}
            disabled={records.length === 0}
            className="flex items-center gap-1.5 bg-white text-forest border-forest/20"
          >
            <Download className="w-4 h-4" />
            <span>تصدير CSV عربي</span>
          </Button>
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

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-sand pb-1">
        <button
          onClick={() => setActiveTab('sessions')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${
            activeTab === 'sessions'
              ? 'bg-forest text-sand-light shadow-md'
              : 'text-charcoal/70 hover:bg-white hover:text-forest'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>جدول واجتماعات الجمعة ({sessions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('records')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${
            activeTab === 'records'
              ? 'bg-forest text-sand-light shadow-md'
              : 'text-charcoal/70 hover:bg-white hover:text-forest'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>سجل الحضور المباشر والتفاصيل ({records.length})</span>
        </button>
      </div>

      {/* TAB 1: SESSIONS MANAGEMENT */}
      {activeTab === 'sessions' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold text-forest mb-1 block">تصفية حسب القسم الكشفي:</label>
              <select
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-sand bg-white text-xs font-bold text-forest outline-none shadow-sm"
              >
                <option value="all">جميع الأقسام الكشفية</option>
                <option value="general">اجتماعات عامة (لكافة الفوج)</option>
                {sections.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    {sec.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-forest mb-1 block">تصفية حسب الحالة:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-sand bg-white text-xs font-bold text-forest outline-none shadow-sm"
              >
                <option value="all">جميع الحالات</option>
                <option value="open">مفتوح للحضور حالياً 🟢</option>
                <option value="scheduled">مجدول ⏳</option>
                <option value="closed">مغلق 🔒</option>
              </select>
            </div>

            <div className="flex items-end">
              <Button
                variant="adventure"
                size="sm"
                onClick={openCreateModal}
                className="w-full h-[38px] flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>إنشاء اجتماع جديد</span>
              </Button>
            </div>
          </div>

          {/* Sessions List */}
          {filteredSessions.length === 0 ? (
            <Card className="p-8 text-center bg-white rounded-3xl border-sand">
              <Calendar className="w-12 h-12 text-forest/40 mx-auto mb-3" />
              <h3 className="text-base font-bold text-forest">لا توجد اجتماعات جمعة مطابقة</h3>
              <p className="text-xs text-charcoal/60 mt-1 max-w-sm mx-auto">
                لم يتم العثور على أي اجتماعات جمعة تطابق معايير التصفية المحددة.
              </p>
              <Button variant="adventure" size="sm" onClick={openCreateModal} className="mt-4">
                إضافة أول اجتماع جمعة ➕
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredSessions.map((session) => {
                const isOpen = session.is_open_for_attendance;
                const stats = session.stats || {
                  actual_attendance_count: 0,
                  uniform_count: 0,
                  late_count: 0,
                };

                return (
                  <div
                    key={session.id}
                    className={`bg-white rounded-3xl border p-5 scout-card-shadow transition-all space-y-4 ${
                      isOpen ? 'border-emerald ring-2 ring-emerald/20' : 'border-sand'
                    }`}
                  >
                    {/* Header: Title & Badges */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {isOpen ? (
                            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald text-white animate-pulse">
                              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                              <span>مفتوح للحضور الآن</span>
                            </span>
                          ) : (
                            <Badge variant="neutral" size="sm">
                              {session.status === 'scheduled' ? 'مجدول' : 'مغلق'}
                            </Badge>
                          )}

                          <span className="bg-sand/30 text-forest px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                            {session.section?.name || 'كافة الأقسام (اجتماع عام)'}
                          </span>

                          {session.year && (
                            <span className="bg-forest/10 text-forest px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                              {session.year.name}
                            </span>
                          )}
                        </div>

                        <h3 className="text-base font-black text-forest">{session.title}</h3>
                        <p className="text-xs text-charcoal/60 flex items-center gap-1 mt-0.5 font-mono">
                          <Calendar className="w-3.5 h-3.5 text-orange" />
                          <span>{session.session_date}</span>
                          <span className="mx-1">•</span>
                          <Clock className="w-3.5 h-3.5 text-forest" />
                          <span>
                            البدء: {session.start_time.slice(0, 5)} | حد التأخير: {session.late_threshold_time.slice(0, 5)}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditModal(session)}
                          title="تعديل الاجتماع"
                          className="p-1.5 rounded-xl hover:bg-sand/40 text-charcoal/60 hover:text-forest transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteSessionConfirmId(session.id)}
                          title="حذف الاجتماع"
                          className="p-1.5 rounded-xl hover:bg-rose-50 text-charcoal/40 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-3 gap-2 bg-cream/40 p-3 rounded-2xl border border-sand/60 text-center">
                      <div>
                        <span className="text-base font-black text-forest block">
                          {stats.actual_attendance_count}
                        </span>
                        <span className="text-[10px] text-charcoal/60">حضور مسجل</span>
                      </div>
                      <div>
                        <span className="text-base font-black text-emerald block">
                          {stats.uniform_count}
                        </span>
                        <span className="text-[10px] text-charcoal/60">بالزي الكشفي</span>
                      </div>
                      <div>
                        <span className="text-base font-black text-orange block">
                          {stats.late_count || 0}
                        </span>
                        <span className="text-[10px] text-charcoal/60">تأخير</span>
                      </div>
                    </div>

                    {session.notes && (
                      <p className="text-[11px] text-charcoal/70 bg-sand/20 p-2 rounded-xl">
                        {session.notes}
                      </p>
                    )}

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-sand/60">
                      <Button
                        size="sm"
                        variant={isOpen ? 'outline' : 'adventure'}
                        onClick={() => handleToggleAttendance(session)}
                        className={`text-xs flex items-center gap-1.5 ${
                          isOpen ? 'border-rose-300 text-rose-700 hover:bg-rose-50' : 'bg-emerald text-white'
                        }`}
                      >
                        {isOpen ? (
                          <>
                            <Square className="w-3.5 h-3.5" />
                            <span>إغلاق الحضور 🔒</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>فتح الحضور الآن 🟢</span>
                          </>
                        )}
                      </Button>

                      <div className="flex items-center gap-1.5">
                        <Link href={`/leader/scanner?sessionId=${session.id}`}>
                          <Button variant="outline" size="sm" className="text-xs bg-white text-forest border-sand">
                            <QrCode className="w-3.5 h-3.5 text-orange" />
                            <span>الماسح</span>
                          </Button>
                        </Link>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            handleSessionChange(session.id);
                            setActiveTab('records');
                          }}
                          className="text-xs bg-sand/40 hover:bg-sand text-forest"
                        >
                          <span>سجل الحضور</span>
                          <ArrowRight className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: LIVE ATTENDANCE RECORDS & DASHBOARD */}
      {activeTab === 'records' && (
        <div className="space-y-4">
          {/* Session Selector & KPI Cards */}
          <div className="bg-white p-5 rounded-3xl border border-sand scout-card-shadow flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="w-full md:w-auto flex items-center gap-3">
              <Calendar className="w-5 h-5 text-forest" />
              <span className="text-xs font-bold text-forest whitespace-nowrap">اختر اجتماع الجمعة:</span>
              <select
                value={selectedSessionId}
                onChange={(e) => handleSessionChange(e.target.value)}
                className="w-full md:w-80 px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs font-bold text-forest outline-none shadow-sm"
              >
                {sessions.map((sess) => (
                  <option key={sess.id} value={sess.id}>
                    {sess.title} ({sess.session_date}) {sess.is_open_for_attendance ? '🟢 [مفتوح]' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-4 gap-2 w-full md:w-auto text-center">
              <div className="bg-forest/5 p-2.5 rounded-2xl border border-forest/10 min-w-[70px]">
                <span className="text-lg font-black text-forest block">{totalAttendees}</span>
                <span className="text-[10px] text-charcoal/60">حضور</span>
              </div>
              <div className="bg-emerald/10 p-2.5 rounded-2xl border border-emerald/20 min-w-[70px]">
                <span className="text-lg font-black text-emerald block">{uniformAttendees} ({uniformPercentage}%)</span>
                <span className="text-[10px] text-charcoal/60">بالزي</span>
              </div>
              <div className="bg-sand/30 p-2.5 rounded-2xl border border-sand min-w-[70px]">
                <span className="text-lg font-black text-forest block">{onTimeAttendees}</span>
                <span className="text-[10px] text-charcoal/60">طابور مبكر</span>
              </div>
              <div className="bg-orange/10 p-2.5 rounded-2xl border border-orange/20 min-w-[70px]">
                <span className="text-lg font-black text-orange block">{lateAttendees}</span>
                <span className="text-[10px] text-charcoal/60">تأخير</span>
              </div>
            </div>
          </div>

          {/* Attendee Search Bar */}
          <div className="relative">
            <input
              type="text"
              value={searchAttendee}
              onChange={(e) => setSearchAttendee(e.target.value)}
              placeholder="ابحث في سجل هذا الاجتماع بالاسم أو رقم القيد..."
              className="w-full px-4 py-2.5 rounded-2xl border border-sand bg-white text-xs focus:border-emerald outline-none text-right pr-9 shadow-sm"
            />
            <Search className="w-4 h-4 text-charcoal/40 absolute right-3 top-3.5" />
          </div>

          {/* Attendance Records Table */}
          <Card className="bg-white rounded-3xl border-sand scout-card-shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-sand/30 text-forest font-bold border-b border-sand/60">
                  <tr>
                    <th className="py-3 px-4">رقم القيد</th>
                    <th className="py-3 px-4">اسم الكشاف</th>
                    <th className="py-3 px-4">وقت التسجيل</th>
                    <th className="py-3 px-4">طريقة التحضير</th>
                    <th className="py-3 px-4">الزي الكشفي</th>
                    <th className="py-3 px-4">التوقيت</th>
                    <th className="py-3 px-4 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand/40">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-charcoal/50">
                        لا توجد سجلات حضور مسجلة لهذا الاجتماع
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((r) => (
                      <tr key={r.id} className="hover:bg-cream/20 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-forest">
                          {r.member?.member_number || '---'}
                        </td>
                        <td className="py-3 px-4 font-bold text-forest">
                          {r.member?.full_name || 'كشاف غير مسجل'}
                        </td>
                        <td className="py-3 px-4 text-charcoal/70 font-mono">
                          {new Date(r.recorded_at).toLocaleTimeString('ar-EG')}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                              r.is_manual ? 'bg-orange/20 text-orange' : 'bg-sand/40 text-forest'
                            }`}
                            title={r.manual_reason || undefined}
                          >
                            {r.is_manual ? `يدوي (${r.manual_reason || 'غير محدد'})` : 'ماسح QR'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => handleToggleUniform(r)}
                            title="انقر لتعديل حالة الزي"
                            className="cursor-pointer transition-transform active:scale-95"
                          >
                            <Badge
                              variant={r.uniform_status === 'with_uniform' ? 'emerald' : 'neutral'}
                              size="sm"
                              className="hover:opacity-80"
                            >
                              {r.uniform_status === 'with_uniform' ? 'بالزي الكشفي ✓' : 'بدون زي ✗'}
                            </Badge>
                          </button>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={r.arrival_status === 'on_time' ? 'emerald' : 'orange'} size="sm">
                            {r.arrival_status === 'on_time' ? 'مبكر' : 'متأخر'}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setDeleteRecordConfirmId(r.id)}
                            className="p-1.5 rounded-xl hover:bg-rose-50 text-charcoal/40 hover:text-rose-600 transition-colors text-[11px]"
                            title="إلغاء تسجيل هذا الحضور"
                          >
                            <Trash2 className="w-3.5 h-3.5 mx-auto" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* CREATE / EDIT MEETING MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSession ? 'تعديل اجتماع الجمعة ✏️' : 'إنشاء اجتماع جمعة جديد 🏕️'}
      >
        <form onSubmit={handleSaveMeeting} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-forest mb-1 block">عنوان الاجتماع *</label>
            <input
              type="text"
              required
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="مثال: اجتماع الجمعة الكشفي - طابور الصباح"
              className="w-full px-3 py-2 rounded-xl border border-sand text-xs font-bold text-forest outline-none focus:border-emerald"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-forest mb-1 block">تاريخ الاجتماع *</label>
              <input
                type="date"
                required
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-sand text-xs font-bold text-forest outline-none focus:border-emerald"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-forest mb-1 block">القسم الكشفي المستهدف:</label>
              <select
                value={formSectionId}
                onChange={(e) => {
                  setFormSectionId(e.target.value);
                  setFormYearId('');
                }}
                className="w-full px-3 py-2 rounded-xl border border-sand text-xs font-bold text-forest outline-none focus:border-emerald"
              >
                <option value="">كافة الأقسام (اجتماع عام للفوج)</option>
                {sections.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    {sec.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {availableFormYears.length > 0 && (
            <div>
              <label className="text-xs font-bold text-forest mb-1 block">السنة الكشفية / المستوى (اختياري):</label>
              <select
                value={formYearId}
                onChange={(e) => setFormYearId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-sand text-xs font-bold text-forest outline-none focus:border-emerald"
              >
                <option value="">جميع سنوات هذا القسم</option>
                {availableFormYears.map((yr) => (
                  <option key={yr.id} value={yr.id}>
                    {yr.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-forest mb-1 block">وقت البدء الرسمي:</label>
              <input
                type="time"
                value={formStartTime}
                onChange={(e) => setFormStartTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-sand text-xs font-mono font-bold text-forest outline-none focus:border-emerald"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-forest mb-1 block">حد التأخير (طابور الصباح):</label>
              <input
                type="time"
                value={formLateThreshold}
                onChange={(e) => setFormLateThreshold(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-sand text-xs font-mono font-bold text-forest outline-none focus:border-emerald"
              />
            </div>
          </div>

          {!editingSession && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="openNow"
                checked={formIsOpen}
                onChange={(e) => setFormIsOpen(e.target.checked)}
                className="w-4 h-4 text-emerald rounded border-sand focus:ring-emerald cursor-pointer"
              />
              <label htmlFor="openNow" className="text-xs font-bold text-forest cursor-pointer select-none">
                فتح باب الحضور مباشرة فور الإنشاء 🟢
              </label>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-forest mb-1 block">ملاحظات أو توجيهات الاجتماع:</label>
            <textarea
              rows={2}
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="مثال: ارتداء الزي الكشفي الكامل، التواجد في الفناء الساعة 8:30"
              className="w-full px-3 py-2 rounded-xl border border-sand text-xs font-medium text-forest outline-none focus:border-emerald resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-sand">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(false)}
              disabled={isSaving}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              variant="adventure"
              size="sm"
              isLoading={isSaving}
            >
              {editingSession ? 'حفظ التعديلات' : 'إنشاء الاجتماع'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* DELETE SESSION CONFIRM MODAL */}
      <Modal
        isOpen={Boolean(deleteSessionConfirmId)}
        onClose={() => setDeleteSessionConfirmId(null)}
        title="تأكيد حذف اجتماع الجمعة ⚠️"
      >
        <div className="space-y-4">
          <p className="text-xs text-charcoal/80 leading-relaxed">
            هل أنت متأكد من رغبتك في حذف هذا الاجتماع؟ سيؤدي ذلك إلى حذف كافة سجلات الحضور المرتبطة به ولا يمكن التراجع عن هذا الإجراء.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-sand">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteSessionConfirmId(null)}
            >
              إلغاء
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => deleteSessionConfirmId && handleDeleteMeeting(deleteSessionConfirmId)}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              نعم، حذف الاجتماع
            </Button>
          </div>
        </div>
      </Modal>

      {/* DELETE RECORD CONFIRM MODAL */}
      <Modal
        isOpen={Boolean(deleteRecordConfirmId)}
        onClose={() => setDeleteRecordConfirmId(null)}
        title="تأكيد إلغاء تسجيل الحضور ⚠️"
      >
        <div className="space-y-4">
          <p className="text-xs text-charcoal/80 leading-relaxed">
            هل أنت متأكد من رغبتك في إلغاء تسجيل حضور هذا الكشاف لهذا الاجتماع؟ سيتم توثيق عملية الإلغاء في سجل التدقيق.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-sand">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteRecordConfirmId(null)}
            >
              تراجع
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => deleteRecordConfirmId && handleDeleteRecord(deleteRecordConfirmId)}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              نعم، إلغاء الحضور
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
