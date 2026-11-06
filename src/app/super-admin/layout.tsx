import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/auth-service';
import { TopNavbar } from '@/components/navigation/TopNavbar';
import { BottomMobileNav } from '@/components/navigation/BottomMobileNav';

export const instant = false;

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();

  if (!session || !session.userId) {
    redirect('/login?redirect=/super-admin');
  }

  const isSuperAdmin = session.roles.includes('super_admin');
  if (!isSuperAdmin) {
    const isLeader =
      session.roles.includes('section_leader') ||
      session.roles.includes('assistant_leader') ||
      session.roles.includes('admin') ||
      session.roles.includes('attendance_leader');

    redirect(isLeader ? '/leader' : '/dashboard');
  }

  return (
    <div className="min-h-screen flex flex-col bg-cream text-charcoal">
      <TopNavbar
        userName={session.profile?.full_name || session.email?.split('@')[0]}
        currentRole="super_admin"
      />
      <div className="flex-1 pb-24 md:pb-12">{children}</div>
      <BottomMobileNav currentRole="super_admin" />
    </div>
  );
}
