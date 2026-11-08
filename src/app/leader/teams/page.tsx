'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Shuffle,
  CheckCircle2,
  Crown,
  ArrowRight,
  Users,
  AlertCircle,
  ShieldCheck,
  Sparkles,
  Settings2,
} from 'lucide-react';
import { Profile, TeamDistribution } from '@/types';
import {
  generateTeamDistributionAction,
  publishTeamDistributionAction,
  getAdminTeamsDataAction,
} from '@/app/actions/scout-actions';
import { getFullScoutScopeDisplay } from '@/lib/sections/section-helper';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function LeaderTeamsPage() {
  const [activeDistribution, setActiveDistribution] = useState<TeamDistribution | null>(null);
  const [teamCount, setTeamCount] = useState<number>(3);
  const [title, setTitle] = useState('توزيع طلائع القسم الكشفي');
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

  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const data = await getAdminTeamsDataAction();
        if (data.activeDistribution) {
          setActiveDistribution(data.activeDistribution);
          setTitle(data.activeDistribution.title);
        }
        if (data.metrics) {
          setMetrics(data.metrics);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'فشل تحميل بيانات طلائع القسم.';
        setErrorMessage(msg);
      }
    }
    loadData();
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setPublishSuccess(false);
    setErrorMessage(null);
    try {
      const generated = await generateTeamDistributionAction({
        title,
        mode: 'mixed_stages',
        mixedConfig: { teamCount },
      });
      setActiveDistribution(generated);
      const data = await getAdminTeamsDataAction();
      if (data.metrics) setMetrics(data.metrics);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء توزيع الطلائع.';
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
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء نشر تشكيل الطلائع.';
      setErrorMessage(msg);
    } finally {
      setIsPublishing(false);
    }
  };

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
            <span className="text-xs font-bold text-forest">فرق وطلائع القسم</span>
          </div>
          <h1 className="text-2xl font-black text-forest">إدارة وتوزيع طلائع القسم 🏕️</h1>
          <p className="text-xs text-charcoal/70">
            توليد وتوزيع طلائع متوازنة للأعضاء المصرح لك بإدارتهم
          </p>
        </div>

        {activeDistribution && (
          <Button
            variant="adventure"
            size="sm"
            onClick={handlePublish}
            isLoading={isPublishing}
            disabled={activeDistribution.status === 'published'}
            className="text-xs flex items-center gap-1.5 shadow-md"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{activeDistribution.status === 'published' ? 'الطلائع منشورة للكشافة' : 'اعتماد ونشر الطلائع'}</span>
          </Button>
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

      {publishSuccess && (
        <div className="p-4 bg-emerald/10 border border-emerald/30 rounded-2xl flex items-center gap-3 text-xs font-bold text-emerald-dark">
          <CheckCircle2 className="w-5 h-5 text-emerald shrink-0" />
          <span>تم اعتماد ونشر طلائع القسم بنجاح! يمكن للكشافة الآن رؤية طليعتهم في لوحاتهم.</span>
        </div>
      )}

      {/* Leader Eligibility Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3 rounded-2xl border border-sand shadow-sm text-center">
          <div className="flex items-center justify-center gap-1 text-[11px] text-charcoal/60 mb-0.5 font-bold">
            <Users className="w-3.5 h-3.5 text-forest" />
            <span>إجمالي الأعضاء</span>
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
            <span>🏕️</span>
            <span>الطلائع النشطة</span>
          </div>
          <span className="text-xl font-black text-orange">{metrics.teamCount}</span>
        </div>
      </div>

      {/* Generation Settings */}
      <Card className="bg-white rounded-3xl border-sand scout-card-shadow p-6">
        <CardHeader className="p-0 pb-4 border-b border-sand/40 mb-4">
          <CardTitle className="text-base font-bold text-forest flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-orange" />
            <span>إعدادات توزيع طلائع القسم</span>
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
                className="w-full px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald outline-none text-right font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-charcoal/80 mb-1">
                عدد الطلائع المطلوبة: <strong className="text-orange font-black text-sm">{teamCount}</strong> طلائع
                {metrics.eligibleMembers > 0 && (
                  <span className="text-[11px] text-charcoal/60 mr-2">
                    (حوالي {Math.round(metrics.eligibleMembers / Math.max(1, teamCount))} كشاف لكل طليعة)
                  </span>
                )}
              </label>
              <input
                type="range"
                min="2"
                max={Math.max(2, Math.min(8, metrics.eligibleMembers || 6))}
                value={teamCount}
                onChange={(e) => setTeamCount(Number(e.target.value))}
                className="w-full accent-orange cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-charcoal/50 mt-1 font-mono">
                <span>2 طلائع</span>
                <span>{Math.max(2, Math.min(8, metrics.eligibleMembers || 6))} طلائع</span>
              </div>
            </div>
          </div>

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

      {/* Published/Draft Teams */}
      {activeDistribution && activeDistribution.teams && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-forest">{activeDistribution.title}</h2>
              <Badge variant={activeDistribution.status === 'published' ? 'emerald' : 'orange'} size="sm">
                {activeDistribution.status === 'published' ? 'منشورة رسمياً' : 'مسودة'}
              </Badge>
            </div>
            <span className="text-xs text-charcoal/60">
              {activeDistribution.teams.length} طلائع كشفية
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
    </div>
  );
}
