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
  Layers,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  Profile,
  TeamDistribution,
  DistributionMode,
} from '@/types';
import {
  generateTeamDistributionAction,
  publishTeamDistributionAction,
  swapTeamMembersAction,
  getAdminTeamsDataAction,
} from '@/app/actions/scout-actions';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';

export default function SuperAdminTeamsPage() {
  const [, setDistributions] = useState<TeamDistribution[]>([]);
  const [activeDistribution, setActiveDistribution] = useState<TeamDistribution | null>(null);
  const [mode, setMode] = useState<DistributionMode>('mixed_stages');
  const [teamCount, setTeamCount] = useState<number>(4);
  const [stage1Teams, setStage1Teams] = useState<number>(2);
  const [stage2Teams, setStage2Teams] = useState<number>(2);
  const [stage3Teams, setStage3Teams] = useState<number>(2);
  const [title, setTitle] = useState('توزيع معسكر المغامرة الكشفية');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);

  // Swap modal state
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [selectedTeamA, setSelectedTeamA] = useState<string>('');
  const [selectedMemberA, setSelectedMemberA] = useState<string>('');
  const [selectedTeamB, setSelectedTeamB] = useState<string>('');
  const [selectedMemberB, setSelectedMemberB] = useState<string>('');

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
      } catch (err) {
        console.error('Failed to load teams data', err);
      }
    }
    loadTeamsData();
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setPublishSuccess(false);
    try {
      const generated = await generateTeamDistributionAction({
        title,
        mode,
        mixedConfig: mode === 'mixed_stages' ? { teamCount } : undefined,
        separateConfig:
          mode === 'separate_stages'
            ? {
                stageTeamCounts: {
                  stage_1: stage1Teams,
                  stage_2: stage2Teams,
                  stage_3: stage3Teams,
                },
              }
            : undefined,
      });
      setActiveDistribution(generated);
    } catch (err) {
      alert('حدث خطأ أثناء توزيع الفرق');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!activeDistribution) return;
    setIsPublishing(true);
    try {
      await publishTeamDistributionAction(activeDistribution.id);
      setActiveDistribution((prev) => (prev ? { ...prev, status: 'published', is_current_published: true } : null));
      setPublishSuccess(true);
      setTimeout(() => setPublishSuccess(false), 4000);
    } catch (err) {
      alert('حدث خطأ أثناء اعتماد ونشر التوزيع');
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
    } catch (err) {
      alert('حدث خطأ أثناء تبديل الكشافين');
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
            توزيع متوازن وعادل للأعضاء مع دعم النمط المختلط أو المفصول بالمراحل الكشفية
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

      {publishSuccess && (
        <div className="p-4 bg-emerald/10 border border-emerald/30 rounded-2xl flex items-center gap-3 text-xs font-bold text-emerald-dark animate-in fade-in duration-300">
          <CheckCircle2 className="w-5 h-5 text-emerald shrink-0" />
          <span>تم اعتماد ونشر توزيع الفرق بنجاح! الآن يستطيع كل كشاف رؤية طليعته في لوحته الشخصية.</span>
        </div>
      )}

      {/* Generation Settings Card */}
      <Card className="bg-white rounded-3xl border-sand scout-card-shadow p-6">
        <CardHeader className="p-0 pb-4 border-b border-sand/40 mb-4">
          <CardTitle className="text-base font-bold text-forest flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-orange" />
            <span>إعدادات التوليد والخوارزمية الذكية</span>
          </CardTitle>
        </CardHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <label className="block text-xs font-bold text-charcoal/80 mb-1">نمط التوزيع الخوارزمي</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as DistributionMode)}
                className="w-full px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald outline-none text-right font-bold text-forest"
              >
                <option value="mixed_stages">النمط أ: فرق مختلطة المراحل (توزيع متوازن لكل طليعة)</option>
                <option value="separate_stages">النمط ب: فرق مفصولة حسب المرحلة الكشفية</option>
              </select>
            </div>
          </div>

          {mode === 'mixed_stages' ? (
            <div>
              <label className="block text-xs font-bold text-charcoal/80 mb-1">
                إجمالي عدد الفرق المطلوبة: {teamCount} فرق
              </label>
              <input
                type="range"
                min="2"
                max="8"
                value={teamCount}
                onChange={(e) => setTeamCount(Number(e.target.value))}
                className="w-full accent-orange cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-charcoal/50 mt-1 font-mono">
                <span>2 فرق</span>
                <span>4 فرق (مثالي)</span>
                <span>8 فرق</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-charcoal/80 mb-1">فرق الأشبال (م1)</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={stage1Teams}
                  onChange={(e) => setStage1Teams(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-xl border border-sand text-xs text-center font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-charcoal/80 mb-1">فرق الفتيان (م2)</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={stage2Teams}
                  onChange={(e) => setStage2Teams(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-xl border border-sand text-xs text-center font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-charcoal/80 mb-1">فرق المتقدم (م3)</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={stage3Teams}
                  onChange={(e) => setStage3Teams(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-xl border border-sand text-xs text-center font-bold"
                />
              </div>
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <Button
              variant="adventure"
              size="md"
              onClick={handleGenerate}
              isLoading={isGenerating}
              className="flex items-center gap-2 shadow-md"
            >
              <Shuffle className="w-4 h-4" />
              <span>توليد وتوزيع الفرق الآن</span>
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
                  <Badge variant="neutral" size="sm" className="bg-white/20 text-white border-none">
                    {team.memberships?.length || 0} كشافين
                  </Badge>
                </div>

                <div className="p-4 divide-y divide-sand/40 max-h-72 overflow-y-auto">
                  {team.memberships?.map((m) => {
                    const mem = m.member as Profile;
                    return (
                      <div key={m.id} className="py-2 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          {m.is_leader && <Crown className="w-3.5 h-3.5 text-orange shrink-0 fill-orange" />}
                          <span className={`font-bold ${m.is_leader ? 'text-orange' : 'text-forest'}`}>
                            {mem?.full_name || 'كشاف'}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-charcoal/50">
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
            اختر كشافاً من الفريق الأول وكشافاً من الفريق الثاني لتبادل مكانيهما مع الحفاظ على التوازن.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {/* Team A */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-forest">الفريق الأول</label>
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

              <label className="block text-xs font-bold text-charcoal/70">العضو المستبدل</label>
              <select
                value={selectedMemberA}
                onChange={(e) => setSelectedMemberA(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl border border-sand bg-white text-xs"
              >
                <option value="">-- اختر كشاف --</option>
                {teamAMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Team B */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-forest">الفريق الثاني</label>
              <select
                value={selectedTeamB}
                onChange={(e) => {
                  setSelectedTeamB(e.target.value);
                  setSelectedMemberB('');
                }}
                className="w-full px-2.5 py-1.5 rounded-xl border border-sand bg-cream/20 text-xs font-bold"
              >
                {activeDistribution?.teams
                  ?.filter((t) => t.id !== selectedTeamA)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>

              <label className="block text-xs font-bold text-charcoal/70">العضو المستبدل</label>
              <select
                value={selectedMemberB}
                onChange={(e) => setSelectedMemberB(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl border border-sand bg-white text-xs"
              >
                <option value="">-- اختر كشاف --</option>
                {teamBMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSwapModalOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="adventure"
              size="sm"
              disabled={!selectedMemberA || !selectedMemberB}
              onClick={handleExecuteSwap}
            >
              <span>تنفيذ التبديل</span>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
