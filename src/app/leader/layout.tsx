import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/auth-service';
import { TopNavbar } from '@/components/navigation/TopNavbar';
import { BottomMobileNav } from '@/components/navigation/BottomMobileNav';

export const instant = false;

export default async function LeaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();

  if (!session || !session.userId) {
    redirect('/login?redirect=/leader');
  }

  const isLeader =
    session.roles.includes('super_admin') ||
    session.roles.includes('admin') ||
    session.roles.includes('section_leader') ||
    session.roles.includes('assistant_leader') ||
    session.roles.includes('attendance_leader');

  if (!isLeader) {
    redirect('/dashboard');
  }

  const primaryRole = session.roles.includes('super_admin')
    ? 'super_admin'
    : session.roles.includes('section_leader')
    ? 'section_leader'
    : 'assistant_leader';

  return (
    <div className="min-h-screen flex flex-col bg-cream text-charcoal">
      <TopNavbar
        userName={session.profile?.full_name || session.email?.split('@')[0]}
        currentRole={primaryRole}
      />
      <div className="flex-1 pb-24 md:pb-12">{children}</div>
      <BottomMobileNav currentRole={primaryRole} />
    </div>
  );
}
