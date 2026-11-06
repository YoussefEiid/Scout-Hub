'use client';

import React, { useState, useEffect } from 'react';
import { TopNavbar } from '@/components/navigation/TopNavbar';
import { BottomMobileNav } from '@/components/navigation/BottomMobileNav';
import { TeamRosterCard } from '@/components/scout/TeamRosterCard';
import { getMemberTeamDataAction } from '@/app/actions/scout-actions';
import { Profile, Team } from '@/types';

export default function MemberTeamPage() {
  const [member, setMember] = useState<Profile | null>(null);
  const [team, setTeam] = useState<Team | null>(null);

  useEffect(() => {
    async function loadTeam() {
      const data = await getMemberTeamDataAction();
      setMember(data.member);
      setTeam(data.team);
    }
    loadTeam();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-cream text-charcoal pb-24 md:pb-12">
      <TopNavbar currentRole={member?.roles?.[0]} userName={member?.full_name} />

      <main className="max-w-lg mx-auto w-full px-4 pt-6 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl sm:text-2xl font-black text-forest">طليعتك الكشفية 🏕️</h1>
          <p className="text-xs text-charcoal/70">
            تعرف على أبطال طليعتك ورائد الطليعة للموسم الحالي
          </p>
        </div>

        <TeamRosterCard
          team={team}
          currentMemberId={member?.id}
          isNewlyRevealed={true}
        />
      </main>

      <BottomMobileNav currentRole={member?.roles?.[0]} />
    </div>
  );
}
