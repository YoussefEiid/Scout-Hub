'use client';

import React, { useState, useEffect } from 'react';
import {
  Shuffle,
  CheckCircle2,
  Crown,
  ArrowRightLeft,
  Settings2,
} from 'lucide-react';
import { TopNavbar } from '@/components/navigation/TopNavbar';
import { BottomMobileNav } from '@/components/navigation/BottomMobileNav';
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

export default function AdminTeamsPage() {
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
        setActiveDistribution(data.activeDistribution);
      } catch (err) {
        console.error('Failed to load admin teams', err);
      }
    }
    loadTeamsData();
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const generated = await generateTeamDistributionAction({
        title,
        mode,
        mixedConfig: { teamCount },
        separateConfig: {
          stageTeamCounts: {
            stage_1: stage1Teams,
            stage_2: stage2Teams,
            stage_3: stage3Teams,
          },
        },
      });

      setActiveDistribution(generated);
      setDistributions((prev) => [generated, ...prev]);
    } catch (err: any) {
      alert(err?.message || 'حدث خطأ أثناء توليد الفرق');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!activeDistribution) return;
    const confirm = window.confirm(
      'هل أنت متأكد من اعتماد ونشر هذه الفرق؟ بمجرد النشر، سيتمكن جميع الكشافة من رؤية طلائعهم الجديدة في لوحاتهم.'
    );
    if (!confirm) return;

    setIsPublishing(true);
    try {
      await publishTeamDistributionAction(activeDistribution.id);
      setActiveDistribution({
        ...activeDistribution,
        status: 'published',
        is_current_published: true,
      });
      setPublishSuccess(true);
      setTimeout(() => setPublishSuccess(false), 4000);
    } catch (err: any) {
      alert(err?.message || 'تعذر نشر الفرق');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSwapMembers = async () => {
    if (!activeDistribution || !selectedTeamA || !selectedMemberA || !selectedTeamB || !selectedMemberB) {
      alert('يرجى تحديد الفريقين والكشافين للتبديل');
      return;
    }

    try {
      const res = await swapTeamMembersAction({
        distributionId: activeDistribution.id,
        teamAId: selectedTeamA,
        memberAId: selectedMemberA,
        teamBId: selectedTeamB,
        memberBId: selectedMemberB,
      });

      if (res.success && res.distribution) {
        setActiveDistribution(res.distribution);
        setSwapModalOpen(false);
      }
    } catch (err: any) {
      alert(err?.message || 'فشل تبديل الأعضاء');
    }
  };

  const stageLabels: Record<string, string> = {
    stage_1: 'أشبال',
    stage_2: 'فتيان',
    stage_3: 'متقدم',
  };

  return (
    <div className="min-h-screen flex flex-col bg-cream text-charcoal pb-24 md:pb-12">
      <TopNavbar currentRole="admin" />

      <main className="max-w-4xl mx-auto w-full px-4 pt-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-forest">محرك توزيع الفرق الكشفية</h1>
            <p className="text-xs text-charcoal/70">
              توليد عادل ومتوازن للطلائع مع دعم المراحل المختلطة والمنفصلة
            </p>
          </div>

          {activeDistribution && (
            <Badge variant={activeDistribution.status === 'published' ? 'emerald' : 'orange'} size="md">
              {activeDistribution.status === 'published' ? 'النسخة المنشورة رسميًا' : 'مسودة غير منشورة'}
            </Badge>
          )}
        </div>

        {/* Generator Controls Card */}
        <Card className="bg-white/95 border-sand">
          <CardHeader className="border-b border-sand/30 pb-3">
            <CardTitle className="text-base text-forest flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-orange" />
              <span>إعدادات التوليد المتوازن</span>
            </CardTitle>
          </CardHeader>

          <CardContent className="pt-3 space-y-4">
            <div>
              <label className="block text-xs font-bold text-charcoal/80 mb-1">عنوان التوزيع الكشفي:</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-sand text-xs bg-cream/20 text-right outline-none focus:border-emerald"
              />
            </div>

            {/* Mode Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-charcoal/80">نمط التوزيع (Mode):</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('mixed_stages')}
                  className={`p-3 rounded-xl border-2 text-right transition-all cursor-pointer ${
                    mode === 'mixed_stages'
                      ? 'bg-forest text-white border-forest shadow-sm'
                      : 'bg-white text-charcoal border-sand hover:border-forest/40'
                  }`}
                >
                  <div className="text-xs font-bold">النمط أ: مراحل مختلطة (Mixed)</div>
                  <div className={`text-[10px] mt-0.5 ${mode === 'mixed_stages' ? 'text-cream/80' : 'text-charcoal/60'}`}>
                    دمج المراحل بتوازن دقيق في كل طليعة
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('separate_stages')}
                  className={`p-3 rounded-xl border-2 text-right transition-all cursor-pointer ${
                    mode === 'separate_stages'
                      ? 'bg-forest text-white border-forest shadow-sm'
                      : 'bg-white text-charcoal border-sand hover:border-forest/40'
                  }`}
                >
                  <div className="text-xs font-bold">النمط ب: مراحل منفصلة (Separated)</div>
                  <div className={`text-[10px] mt-0.5 ${mode === 'separate_stages' ? 'text-cream/80' : 'text-charcoal/60'}`}>
                    توليد فرق مستقلة لكل مرحلة كشفية
                  </div>
                </button>
              </div>
            </div>

            {/* Team Count Options */}
            {mode === 'mixed_stages' ? (
              <div>
                <label className="block text-xs font-bold text-charcoal/80 mb-1">
                  إجمالي عدد الفرق المطلوبة:
                </label>
                <div className="flex items-center gap-2">
                  {[2, 3, 4, 5, 6].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setTeamCount(num)}
                      className={`w-10 h-10 rounded-xl font-bold text-xs border transition-all cursor-pointer ${
                        teamCount === num
                          ? 'bg-emerald text-white border-emerald shadow-sm'
                          : 'bg-white text-charcoal border-sand hover:border-emerald'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                  <span className="text-xs text-charcoal/60 mr-2">
                    (سيتم توزيع 60 عضواً بمعدل {Math.round(60 / teamCount)} أعضاء لكل طليعة)
                  </span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-charcoal/80 mb-1">فرق الأشبال:</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={stage1Teams}
                    onChange={(e) => setStage1Teams(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg border border-sand text-xs text-center"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-charcoal/80 mb-1">فرق الفتيان:</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={stage2Teams}
                    onChange={(e) => setStage2Teams(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg border border-sand text-xs text-center"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-charcoal/80 mb-1">فرق المتقدم:</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={stage3Teams}
                    onChange={(e) => setStage3Teams(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg border border-sand text-xs text-center"
                  />
                </div>
              </div>
            )}

            <div className="pt-2 flex items-center gap-2">
              <Button
                variant="adventure"
                size="md"
                onClick={handleGenerate}
                isLoading={isGenerating}
                className="flex-1 shadow-md"
              >
                <Shuffle className="w-4 h-4 ml-1" />
                <span>توليد وتوزيع الفرق الآن</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Publish Alert */}
        {publishSuccess && (
          <div className="p-3.5 bg-emerald/15 text-emerald-dark border border-emerald rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald shrink-0" />
            <span>تم اعتماد ونشر الفرق بنجاح! أصبحت متاحة الآن في شاشات الكشافة.</span>
          </div>
        )}

        {/* Active Distribution Preview */}
        {activeDistribution && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-forest">{activeDistribution.title}</h3>
                <span className="text-xs text-charcoal/60 font-mono">
                  (بذرة التوزيع: {activeDistribution.random_seed})
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSwapModalOpen(true)}
                  className="text-xs bg-white"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 text-orange ml-1" />
                  <span>تبديل كشافين</span>
                </Button>

                {activeDistribution.status !== 'published' ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handlePublish}
                    isLoading={isPublishing}
                    className="text-xs shadow-md"
                  >
                    <CheckCircle2 className="w-4 h-4 ml-1" />
                    <span>نشر الفرق للأعضاء</span>
                  </Button>
                ) : (
                  <Badge variant="emerald" size="sm">
                    منشور للأعضاء
                  </Badge>
                )}
              </div>
            </div>

            {/* Teams Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeDistribution.teams?.map((team) => {
                const members = team.memberships?.map((m) => m.member).filter(Boolean) as Profile[] || [];

                return (
                  <Card key={team.id} className="bg-white/95 border-sand/80 shadow-sm flex flex-col">
                    <CardHeader className="border-b border-sand/30 pb-3">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold shadow-sm"
                            style={{ backgroundColor: team.color_hex }}
                          >
                            🏕️
                          </div>
                          <div>
                            <CardTitle className="text-sm font-bold text-forest">{team.name}</CardTitle>
                            <span className="text-[10px] text-charcoal/60">
                              {team.stage_id ? stageLabels[team.stage_id] : 'طليعة مختلطة'}
                            </span>
                          </div>
                        </div>

                        <Badge variant="sand" size="sm">
                          {members.length} أعضاء
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="pt-2 flex-1">
                      <div className="divide-y divide-sand/20 text-xs">
                        {members.map((m) => {
                          const isLeader = m.id === team.leader_id;
                          return (
                            <div key={m.id} className="py-2 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-charcoal">{m.full_name}</span>
                                <span className="text-[10px] text-charcoal/50">
                                  ({stageLabels[m.stage_id]})
                                </span>
                              </div>
                              {isLeader && (
                                <span className="text-[10px] bg-orange/15 text-orange-hover px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                                  <Crown className="w-3 h-3" />
                                  <span>رائد</span>
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Member Swap Modal */}
        <Modal
          isOpen={swapModalOpen}
          onClose={() => setSwapModalOpen(false)}
          title="تبديل كشاف بين طليعتين"
          description="اختر كشافين لنقلهما بين طلائعهما لتعديل التشكيل يدويًا بكل مرونة."
        >
          <div className="space-y-4">
            {/* Team A Picker */}
            <div>
              <label className="text-xs font-bold text-charcoal/80 block mb-1">الطليعة الأولى (أ):</label>
              <select
                value={selectedTeamA}
                onChange={(e) => {
                  setSelectedTeamA(e.target.value);
                  setSelectedMemberA('');
                }}
                className="w-full p-2.5 rounded-xl border border-sand text-xs bg-cream/30 text-right"
              >
                <option value="">-- اختر الطليعة الأولى --</option>
                {activeDistribution?.teams?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              {selectedTeamA && (
                <div className="mt-2">
                  <label className="text-xs font-bold text-charcoal/80 block mb-1">الكشاف المراد نقله:</label>
                  <select
                    value={selectedMemberA}
                    onChange={(e) => setSelectedMemberA(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-sand text-xs bg-white text-right"
                  >
                    <option value="">-- اختر الكشاف --</option>
                    {activeDistribution?.teams
                      ?.find((t) => t.id === selectedTeamA)
                      ?.memberships?.map((m) => (
                        <option key={m.member_id} value={m.member_id}>
                          {m.member?.full_name} ({stageLabels[m.member?.stage_id || '']})
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>

            {/* Team B Picker */}
            <div className="pt-2 border-t border-sand/40">
              <label className="text-xs font-bold text-charcoal/80 block mb-1">الطليعة الثانية (ب):</label>
              <select
                value={selectedTeamB}
                onChange={(e) => {
                  setSelectedTeamB(e.target.value);
                  setSelectedMemberB('');
                }}
                className="w-full p-2.5 rounded-xl border border-sand text-xs bg-cream/30 text-right"
              >
                <option value="">-- اختر الطليعة الثانية --</option>
                {activeDistribution?.teams
                  ?.filter((t) => t.id !== selectedTeamA)
                  ?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>

              {selectedTeamB && (
                <div className="mt-2">
                  <label className="text-xs font-bold text-charcoal/80 block mb-1">الكشاف المقابل:</label>
                  <select
                    value={selectedMemberB}
                    onChange={(e) => setSelectedMemberB(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-sand text-xs bg-white text-right"
                  >
                    <option value="">-- اختر الكشاف --</option>
                    {activeDistribution?.teams
                      ?.find((t) => t.id === selectedTeamB)
                      ?.memberships?.map((m) => (
                        <option key={m.member_id} value={m.member_id}>
                          {m.member?.full_name} ({stageLabels[m.member?.stage_id || '']})
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>

            <div className="pt-3">
              <Button
                variant="adventure"
                size="md"
                onClick={handleSwapMembers}
                className="w-full shadow-md text-xs font-bold"
              >
                <ArrowRightLeft className="w-4 h-4 ml-1" />
                <span>إتمام التبديل بين الطليعتين</span>
              </Button>
            </div>
          </div>
        </Modal>
      </main>

      <BottomMobileNav currentRole="admin" />
    </div>
  );
}
