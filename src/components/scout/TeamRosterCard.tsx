'use client';

import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Users, Crown, Compass, Sparkles } from 'lucide-react';
import { Team, Profile } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { getFullScoutScopeDisplay, getSectionDisplayName } from '@/lib/sections/section-helper';

interface TeamRosterCardProps {
  team: Team | null;
  currentMemberId?: string;
  isNewlyRevealed?: boolean;
}

export function TeamRosterCard({ team, currentMemberId, isNewlyRevealed = false }: TeamRosterCardProps) {
  useEffect(() => {
    if (team && isNewlyRevealed) {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#23836B', '#E89B50', '#173C32', '#F5EBD8'],
        });
      } catch {
        // Safe fallback if canvas is unavailable
      }
    }
  }, [team, isNewlyRevealed]);

  if (!team) {
    return (
      <Card className="text-center py-10 px-4 bg-white/95 border-dashed border-2 border-sand">
        <div className="w-14 h-14 bg-sand/40 text-orange rounded-full flex items-center justify-center mx-auto mb-3">
          <Compass className="w-8 h-8 animate-spin" />
        </div>
        <h3 className="text-base font-bold text-forest mb-1">الفرق لسه بتتجهز... استعد للمغامرة!</h3>
        <p className="text-xs text-charcoal/70 max-w-xs mx-auto">
          القادة شغالين على توزيع متوازن للفرق. بمجرد اعتمادها ونشرها رسميًا، هتشوف طليعتك هنا!
        </p>
      </Card>
    );
  }


  const members = team.memberships?.map((m) => m.member).filter(Boolean) as Profile[] || [];

  return (
    <div className="space-y-4">
      {/* Team Header Banner */}
      <div
        className="rounded-3xl p-6 text-white shadow-xl relative overflow-hidden"
        style={{ backgroundColor: team.color_hex || '#173C32' }}
      >
        <div className="absolute top-0 left-0 -mt-8 -ml-8 w-36 h-36 bg-white/10 rounded-full blur-xl pointer-events-none" />
        
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-2xl border border-white/30 shadow-inner">
              🏕️
            </div>
            <div>
              <span className="text-xs font-bold text-sand tracking-wide">طليعتك الكشفية</span>
              <h2 className="text-2xl font-black">{team.name}</h2>
            </div>
          </div>
          <Badge variant="orange" size="md">
            {members.length} أعضاء
          </Badge>
        </div>

        <div className="mt-4 pt-3 border-t border-white/20 flex items-center justify-between text-xs text-cream/90">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-orange" />
            <span>نقاط الطليعة: <strong>{team.total_points || 0} نقطة</strong></span>
          </div>
          {team.stage_id && (
            <span className="bg-black/20 px-2.5 py-1 rounded-full text-[11px]">
              {getSectionDisplayName({ stage_id: team.stage_id as any })}
            </span>
          )}
        </div>
      </div>

      {/* Roster Members List (Privacy-guarded: NO phones or emails shown) */}
      <Card className="bg-white/95">
        <CardHeader className="border-b border-sand/30 pb-3">
          <CardTitle className="text-base text-forest flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald" />
            <span>أبطال الطليعة</span>
          </CardTitle>
          <span className="text-xs text-charcoal/60">موسم 2026</span>
        </CardHeader>

        <CardContent className="pt-2">
          <div className="divide-y divide-sand/30">
            {members.map((m, idx) => {
              const isLeader = m.id === team.leader_id;
              const isMe = m.id === currentMemberId;

              return (
                <div
                  key={m.id}
                  className={`py-3 flex items-center justify-between gap-3 ${
                    isMe ? 'bg-sand/20 -mx-4 px-4 rounded-xl' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-forest/10 text-forest font-bold text-xs flex items-center justify-center border border-forest/20 shrink-0">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-charcoal">{m.full_name}</span>
                        {isMe && (
                          <span className="text-[10px] bg-emerald text-white px-1.5 py-0.5 rounded font-bold">
                            أنت
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-charcoal/60">
                        {getFullScoutScopeDisplay(m)}
                      </span>
                    </div>
                  </div>

                  <div>
                    {isLeader ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-orange/15 text-orange-hover border border-orange/30 px-2 py-0.5 rounded-full font-bold">
                        <Crown className="w-3.5 h-3.5" />
                        <span>رائد الطليعة</span>
                      </span>
                    ) : (
                      <span className="text-xs text-charcoal/40 font-medium">عضو</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
