'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Shuffle, CheckCircle2, Crown, ArrowRight, Compass, Users } from 'lucide-react';
import { Profile, TeamDistribution, DistributionMode } from '@/types';
import {
  generateTeamDistributionAction,
  publishTeamDistributionAction,
  getAdminTeamsDataAction,
} from '@/app/actions/scout-actions';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function LeaderTeamsPage() {
  const [activeDistribution, setActiveDistribution] = useState<TeamDistribution | null>(null);
  const [teamCount, setTeamCount] = useState<number>(3);
  const [title, setTitle] = useState('توزيع طلائع القسم الكشفي');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const data = await getAdminTeamsDataAction();
        if (data.activeDistribution) {
          setActiveDistribution(data.activeDistribution);
          setTitle(data.activeDistribution.title);
        }
      } catch (err) {
        console.error('Failed to load leader teams', err);
      }
    }
    loadData();
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setPublishSuccess(false);
    try {
      const generated = await generateTeamDistributionAction({
        title,
        mode: 'mixed_stages',
        mixedConfig: { teamCount },
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
      alert('حدث خطأ أثناء نشر التوزيع');
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

      {publishSuccess && (
        <div className="p-4 bg-emerald/10 border border-emerald/30 rounded-2xl flex items-center gap-3 text-xs font-bold text-emerald-dark">
          <CheckCircle2 className="w-5 h-5 text-emerald shrink-0" />
          <span>تم اعتماد ونشر طلائع القسم بنجاح!</span>
        </div>
      )}

      {/* Generation Settings */}
      <Card className="bg-white rounded-3xl border-sand scout-card-shadow p-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-charcoal/80 mb-1">عنوان التوزيع</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-sand bg-cream/20 text-xs focus:border-emerald outline-none text-right font-bold text-forest"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-charcoal/80 mb-1">
                عدد الطلائع المرغوبة: {teamCount} طلائع
              </label>
              <input
                type="range"
                min="2"
                max="6"
                value={teamCount}
                onChange={(e) => setTeamCount(Number(e.target.value))}
                className="w-full accent-orange cursor-pointer"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              variant="adventure"
              size="sm"
              onClick={handleGenerate}
              isLoading={isGenerating}
              className="flex items-center gap-1.5"
            >
              <Shuffle className="w-4 h-4" />
              <span>توليد طلائع القسم</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Generated Teams Grid */}
      {activeDistribution && activeDistribution.teams && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeDistribution.teams.map((team, idx) => (
            <Card key={team.id} className="bg-white rounded-3xl border-sand scout-card-shadow overflow-hidden">
              <div
                className="p-4 text-white flex items-center justify-between"
                style={{ backgroundColor: team.color_hex || '#23836B' }}
              >
                <h3 className="text-base font-bold">{team.name}</h3>
                <Badge variant="neutral" size="sm" className="bg-white/20 text-white border-none">
                  {team.memberships?.length || 0} كشافين
                </Badge>
              </div>

              <div className="p-4 divide-y divide-sand/40 max-h-64 overflow-y-auto">
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
                      <span className="font-mono text-[10px] text-charcoal/50">{mem?.member_number}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
