'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Shuffle,
  CheckCircle2,
  Crown,
  ArrowRightLeft,
  Settings2,
  ArrowRight,
  AlertCircle,
  Users,
  ShieldCheck,
  UserX,
  Clock,
  Sparkles,
} from 'lucide-react';
import {
  Profile,
  TeamDistribution,
  DistributionMode,
  ScoutSection,
} from '@/types';
import {
  generateTeamDistributionAction,
  publishTeamDistributionAction,
  swapTeamMembersAction,
  getAdminTeamsDataAction,
} from '@/app/actions/scout-actions';
import { getFullScoutScopeDisplay } from '@/lib/sections/section-helper';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';

export default function SuperAdminTeamsPage() {
  const [, setDistributions] = useState<TeamDistribution[]>([]);
  const [activeDistribution, setActiveDistribution] = useState<TeamDistribution | null>(null);
  const [sections, setSections] = useState<ScoutSection[]>([]);
  const [metrics, setMetrics] = useState<{
    totalMembers: number;
    activeMembers: number;
    eligibleMembers: number;
    pendingSectionMembers: number;
    excludedMembers: number;
    teamCount: number;
  }>({
    totalMembers: 0,
    activeMembers: 0,
    eligibleMembers: 0,
    pendingSectionMembers: 0,
    excludedMembers: 0,
    teamCount: 0,
  });

  const [mode, setMode] = useState<DistributionMode>('mixed_stages');
  const [teamCount, setTeamCount] = useState<number>(4);
  const [sectionTeamCounts, setSectionTeamCounts] = useState<Record<string, number>>({});
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('all');
  const [title, setTitle] = useState('توزيع معسكر المغامرة الكشفية');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Swap modal state
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [selectedTeamA, setSelectedTeamA] = useState<string>('');
  const [selectedMemberA, setSelectedMemberA] = useState<string>('');
  const [selectedTeamB, setSelectedTeamB] = useState<string>('');
  const [selectedMemberB, setSelectedMemberB] = useState<string>('');
  const [isSwapping, setIsSwapping] = useState(false);

  useEffect(() => {
    async function loadTeamsData() {
      try {
        const data = await getAdminTeamsDataAction();
        setDistributions(data.distributions);
        if (data.activeDistribution) {
          setActiveDistribution(data.activeDistribution);
          setMode(data.activeDistribution.mode);
          setTitle(data.activeDistribution.title);
        }
        if (data.metrics) {
          setMetrics(data.metrics);
        }
        if (data.sections) {
          setSections(data.sections);
          const initialCounts: Record<string, number> = {};
          for (const s of data.sections) {
            initialCounts[s.id] = 2;
          }
          setSectionTeamCounts(initialCounts);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'فشل تحميل بيانات الفرق والطلائع.';
        setErrorMessage(msg);
      }
    }
    loadTeamsData();
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setPublishSuccess(false);
    setErrorMessage(null);

    try {
      const generated = await generateTeamDistributionAction({
        title,
        mode,
        sectionId: selectedSectionFilter !== 'all' ? selectedSectionFilter : undefined,
        mixedConfig:
          mode === 'mixed_stages'
            ? {
                teamCount,
                sectionId: selectedSectionFilter !== 'all' ? selectedSectionFilter : undefined,
              }
            : undefined,
        separateConfig:
          mode === 'separate_stages'
            ? {
                sectionTeamCounts,
              }
            : undefined,
      });
      setActiveDistribution(generated);
      // Reload metrics
      const data = await getAdminTeamsDataAction();
      if (data.metrics) setMetrics(data.metrics);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء توزيع الفرق.';
      setErrorMessage(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!activeDistribution) return;
    setIsPublishing(true);
    setErrorMessage(null);
    try {
      await publishTeamDistributionAction(activeDistribution.id);
      setActiveDistribution((prev) => (prev ? { ...prev, status: 'published', is_current_published: true } : null));
      setPublishSuccess(true);
      setTimeout(() => setPublishSuccess(false), 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء اعتماد ونشر التوزيع.';
      setErrorMessage(msg);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleOpenSwap = () => {
    if (!activeDistribution?.teams || activeDistribution.teams.length < 2) return;
    setSelectedTeamA(activeDistribution.teams[0].id);
    setSelectedMemberA('');
    setSelectedTeamB(activeDistribution.teams[1].id);
    setSelectedMemberB('');
    setSwapModalOpen(true);
  };

  const handleExecuteSwap = async () => {
    if (!activeDistribution || !selectedMemberA || !selectedMemberB) return;
    setIsSwapping(true);
    setErrorMessage(null);
    try {
      await swapTeamMembersAction({
        distributionId: activeDistribution.id,
        teamAId: selectedTeamA,
        memberAId: selectedMemberA,
        teamBId: selectedTeamB,
        memberBId: selectedMemberB,
      });

      // Reload updated distribution
      const data = await getAdminTeamsDataAction();
      if (data.activeDistribution) {
        setActiveDistribution(data.activeDistribution);
      }
      setSwapModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء تبديل الكشافين بين الفرق.';
      setErrorMessage(msg);
    } finally {
      setIsSwapping(false);
    }
  };

  const teamAMembers =
    activeDistribution?.teams?.find((t) => t.id === selectedTeamA)?.memberships?.map((m) => m.member as Profile) || [];
  const teamBMembers =
    activeDistribution?.teams?.find((t) => t.id === selectedTeamB)?.memberships?.map((m) => m.member as Profile) || [];

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
            <span className="text-xs font-bold text-forest">محرك الفرق</span>
          </div>
          <h1 className="text-2xl font-black text-forest">محرك توزيع الفرق والطلائع الكشفية 🏕️</h1>
          <p className="text-xs text-charcoal/70">
            توزيع عادل ومتوازن للأعضاء المؤهلين مع إدارة الأقسام ونمط التوزيع
          </p>
        </div>

        {activeDistribution && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleOpenSwap} className="text-xs flex items-center gap-1.5 bg-white">
              <ArrowRightLeft className="w-4 h-4 text-forest" />
              <span>تبديل يدوي</span>
            </Button>
            <Button
              variant="adventure"
              size="sm"
              onClick={handlePublish}
              isLoading={isPublishing}
              disabled={activeDistribution.status === 'published'}
              className="text-xs flex items-center gap-1.5 shadow-md"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{activeDistribution.status === 'published' ? 'التوزيع معتمد ومنشور' : 'اعتماد ونشر التشكيل'}</span>
            </Button>
          </div>
        )}
      </div>

      {/* Error Alert Banner */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold text-rose-800 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-500 hover:text-rose-800 text-sm font-bold px-2 py-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Success Notification */}
      {publishSuccess && (
        <div className="p-4 bg-emerald/10 border border-emerald/30 rounded-2xl flex items-center gap-3 text-xs font-bold text-emerald-dark animate-in fade-in duration-300">
          <CheckCircle2 className="w-5 h-5 text-emerald shrink-0" />
          <span>تم اعتماد ونشر تشكيل الطلائع بنجاح! يمكن لجميع الكشافة الآن رؤية طليعتهم في لوحاتهم.</span>
        </div>
      )}

      {/* MEMBER ELIGIBILITY SUMMARY METRICS BAR */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3 rounded-2xl border border-sand shadow-sm text-center">
          <div className="flex items-center justify-center gap-1 text-[11px] text-charcoal/60 mb-0.5 font-bold">
            <Users className="w-3.5 h-3.5 text-forest" />
            <span>إجمالي المسجلين</span>
          </div>
          <span className="text-xl font-black text-forest">{metrics.totalMembers}</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-sand shadow-sm text-center">
          <div className="flex items-center justify-center gap-1 text-[11px] text-charcoal/60 mb-0.5 font-bold">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald" />
            <span>كشافة نشطون</span>
          </div>
          <span className="text-xl font-black text-emerald-dark">{metrics.activeMembers}</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-emerald/40 bg-emerald/5 shadow-sm text-center">
          <div className="flex items-center justify-center gap-1 text-[11px] text-emerald-dark mb-0.5 font-bold">
            <Sparkles className="w-3.5 h-3.5 text-emerald" />
            <span>مؤهلون للتوزيع</span>
          </div>
          <span className="text-xl font-black text-emerald">{metrics.eligibleMembers}</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-sand shadow-sm text-center">
          <div className="flex items-center justify-center gap-1 text-[11px] text-charcoal/60 mb-0.5 font-bold">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>بانتظار تحديد قسم</span>
          </div>
          <span className="text-xl font-black text-amber-600">{metrics.pendingSectionMembers}</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-sand shadow-sm text-center">
          <div className="flex items-center justify-center gap-1 text-[11px] text-charcoal/60 mb-0.5 font-bold">
            <UserX className="w-3.5 h-3.5 text-charcoal/50" />
            <span>مستبعدون (قادة/معطل)</span>
          </div>
          <span className="text-xl font-black text-charcoal/60">{metrics.excludedMembers}</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-sand shadow-sm text-center">
          <div className="flex items-center justify-center gap-1 text-[11px] text-charcoal/60 mb-0.5 font-bold">
            <span>🏕️</span>
            <span>الطلائع النشطة</span>
          </div>
          <span className="text-xl font-black text-orange">{metrics.teamCount}</span>
        </div>
      </div>

      {/* Generation Settings Card */}
      <Card className="bg-white rounded-3xl border-sand scout-card-shadow p-6">
        <CardHeader className="p-0 pb-4 border-b border-sand/40 mb-4">
          <CardTitle className="text-base font-bold text-forest flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-orange" />
            <span>إعدادات التوليد والخوارزمية الذكية</span>
          </CardTitle>
        </CardHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-charcoal/80 mb-1">عنوان التوزيع</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald outline-none text-right"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-charcoal/80 mb-1">تحديد القسم الكشفي المستهدف</label>
              <select
                value={selectedSectionFilter}
                onChange={(e) => setSelectedSectionFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald outline-none text-right font-bold text-forest"
              >
                <option value="all">جميع الأقسام الكشفية (توزيع شامل)</option>
                {sections.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    {sec.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-charcoal/80 mb-1">نمط التوزيع</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as DistributionMode)}
                className="w-full px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald outline-none text-right font-bold text-forest"
              >
                <option value="mixed_stages">النمط أ: طلائع مختلطة (توزيع متوازن لكل طليعة)</option>
                <option value="separate_stages">النمط ب: طلائع مفصولة حسب القسم الكشفي</option>
              </select>
            </div>
          </div>

          {mode === 'mixed_stages' ? (
            <div>
              <label className="block text-xs font-bold text-charcoal/80 mb-1">
                إجمالي عدد الطلائع المطلوبة: <strong className="text-orange font-black text-sm">{teamCount}</strong> طلائع
                {metrics.eligibleMembers > 0 && (
                  <span className="text-[11px] text-charcoal/60 mr-2">
                    (حوالي {Math.round(metrics.eligibleMembers / Math.max(1, teamCount))} كشاف لكل طليعة)
                  </span>
                )}
              </label>
              <input
                type="range"
                min="2"
                max={Math.max(2, Math.min(12, metrics.eligibleMembers || 8))}
                value={teamCount}
                onChange={(e) => setTeamCount(Number(e.target.value))}
                className="w-full accent-orange cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-charcoal/50 mt-1 font-mono">
                <span>2 طلائع</span>
                <span>4 طلائع (مثالي)</span>
                <span>{Math.max(2, Math.min(12, metrics.eligibleMembers || 8))} طلائع</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-charcoal/80">
                عدد الطلائع لكل قسم كشفي:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {sections.map((sec) => (
                  <div key={sec.id} className="p-2.5 bg-cream/30 border border-sand rounded-xl">
                    <span className="block text-xs font-bold text-forest mb-1 truncate">{sec.name}</span>
                    <input
                      type="number"
                      min="1"
                      max="6"
                      value={sectionTeamCounts[sec.id] || 2}
                      onChange={(e) =>
                        setSectionTeamCounts((prev) => ({
                          ...prev,
                          [sec.id]: Math.max(1, Number(e.target.value)),
                        }))
                      }
                      className="w-full px-2 py-1 rounded-lg border border-sand text-xs text-center font-bold"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 flex items-center justify-between">
            {metrics.eligibleMembers === 0 ? (
              <span className="text-xs text-amber-700 font-bold flex items-center gap-1">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span>لا يوجد كشافة مؤهلون حالياً للتوزيع.</span>
              </span>
            ) : (
              <span className="text-xs text-charcoal/60">
                جاهز لتوزيع {metrics.eligibleMembers} كشاف مؤهل
              </span>
            )}

            <Button
              variant="adventure"
              size="md"
              onClick={handleGenerate}
              isLoading={isGenerating}
              disabled={isGenerating || metrics.eligibleMembers === 0}
              className="flex items-center gap-2 shadow-md"
            >
              <Shuffle className="w-4 h-4" />
              <span>توليد وتوزيع الطلائع الآن</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Generated Teams Grid */}
      {activeDistribution && activeDistribution.teams && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-forest">{activeDistribution.title}</h2>
              <Badge variant={activeDistribution.status === 'published' ? 'emerald' : 'orange'} size="sm">
                {activeDistribution.status === 'published' ? 'معتمد ومنشور' : 'مسودة قيد المراجعة'}
              </Badge>
            </div>
            <span className="text-xs text-charcoal/60">
              إجمالي: {activeDistribution.teams.length} طلائع كشفية
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeDistribution.teams.map((team, idx) => (
              <Card key={team.id} className="bg-white rounded-3xl border-sand scout-card-shadow overflow-hidden">
                <div
                  className="p-4 text-white flex items-center justify-between"
                  style={{ backgroundColor: team.color_hex || '#23836B' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-black">
                      {idx + 1}
                    </span>
                    <h3 className="text-base font-bold">{team.name}</h3>
                  </div>
                  <Badge variant="neutral" size="sm" className="bg-white/20 text-white border-none font-bold">
                    {team.memberships?.length || 0} كشافين
                  </Badge>
                </div>

                <div className="p-4 divide-y divide-sand/40 max-h-72 overflow-y-auto">
                  {team.memberships?.map((m) => {
                    const mem = m.member as Profile;
                    return (
                      <div key={m.id} className="py-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          {m.is_leader && <Crown className="w-3.5 h-3.5 text-orange shrink-0 fill-orange" />}
                          <div>
                            <span className={`font-bold block ${m.is_leader ? 'text-orange' : 'text-forest'}`}>
                              {mem?.full_name || 'كشاف'}
                            </span>
                            <span className="text-[10px] text-charcoal/60">
                              {getFullScoutScopeDisplay(mem)}
                            </span>
                          </div>
                        </div>
                        <span className="font-mono text-[10px] text-charcoal/60 font-semibold">
                          {mem?.member_number}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Manual Swap Modal */}
      <Modal isOpen={swapModalOpen} onClose={() => setSwapModalOpen(false)} title="التبديل اليدوي بين أعضاء الفرق">
        <div className="space-y-4">
          <p className="text-xs text-charcoal/70 leading-relaxed">
            اختر كشافاً من الطليعة الأولى وكشافاً من الطليعة الثانية لتبادل مكانيهما مع الحفاظ على التوازن.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {/* Team A */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-forest">الطليعة الأولى</label>
              <select
                value={selectedTeamA}
                onChange={(e) => {
                  setSelectedTeamA(e.target.value);
                  setSelectedMemberA('');
                }}
                className="w-full px-2.5 py-1.5 rounded-xl border border-sand bg-cream/20 text-xs font-bold"
              >
                {activeDistribution?.teams?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <select
                value={selectedMemberA}
                onChange={(e) => setSelectedMemberA(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl border border-sand text-xs"
              >
                <option value="">اختر كشافاً من هذه الطليعة</option>
                {teamAMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} ({m.member_number})
                  </option>
                ))}
              </select>
            </div>

            {/* Team B */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-forest">الطليعة الثانية</label>
              <select
                value={selectedTeamB}
                onChange={(e) => {
                  setSelectedTeamB(e.target.value);
                  setSelectedMemberB('');
                }}
                className="w-full px-2.5 py-1.5 rounded-xl border border-sand bg-cream/20 text-xs font-bold"
              >
                {activeDistribution?.teams?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <select
                value={selectedMemberB}
                onChange={(e) => setSelectedMemberB(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl border border-sand text-xs"
              >
                <option value="">اختر كشافاً من هذه الطليعة</option>
                {teamBMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} ({m.member_number})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-sand">
            <Button variant="outline" size="sm" onClick={() => setSwapModalOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="adventure"
              size="sm"
              onClick={handleExecuteSwap}
              isLoading={isSwapping}
              disabled={!selectedMemberA || !selectedMemberB || isSwapping}
            >
              تنفيذ التبديل الآن
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
