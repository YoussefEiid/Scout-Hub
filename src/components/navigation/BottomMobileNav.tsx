'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Compass,
  QrCode,
  Users,
  ShieldCheck,
  User,
  Layers,
  UserCheck,
  Calendar,
  Home,
  LogIn,
} from 'lucide-react';
import { clsx } from 'clsx';
import { createClient } from '@/lib/supabase/client';

interface BottomMobileNavProps {
  currentRole?: string;
}

export function BottomMobileNav({ currentRole: initialRole }: BottomMobileNavProps) {
  const pathname = usePathname();
  const [role, setRole] = useState<string | undefined>(initialRole);

  useEffect(() => {
    if (!initialRole) {
      const supabase = createClient();
      if (!supabase) return;
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .then(({ data: roles }) => {
              const roleList = (roles ?? []).map((r: { role: string }) => r.role);
              if (roleList.includes('super_admin')) setRole('super_admin');
              else if (roleList.includes('section_leader') || roleList.includes('admin')) setRole('section_leader');
              else if (roleList.includes('assistant_leader') || roleList.includes('attendance_leader'))
                setRole('assistant_leader');
              else setRole('member');
            });
        }
      });
    }
  }, [initialRole]);

  interface NavTab {
    href: string;
    label: string;
    icon: React.ElementType;
    highlight?: boolean;
  }

  const isSuperAdmin = role === 'super_admin';
  const isLeader = role === 'section_leader' || role === 'admin' || role === 'assistant_leader' || role === 'attendance_leader';
  const isMember = role === 'member';

  let tabs: NavTab[];

  if (isSuperAdmin) {
    tabs = [
      { href: '/super-admin', label: 'الرئيسية', icon: Layers },
      { href: '/super-admin/sections', label: 'الأقسام', icon: Compass },
      { href: '/super-admin/leaders', label: 'القادة', icon: UserCheck, highlight: true },
      { href: '/super-admin/members', label: 'الأعضاء', icon: Users },
      { href: '/profile', label: 'ملفي', icon: User },
    ];
  } else if (isLeader) {
    tabs = [
      { href: '/leader', label: 'لوحتي', icon: Compass },
      { href: '/leader/members', label: 'الكشافين', icon: Users },
      { href: '/leader/scanner', label: 'الماسح', icon: QrCode, highlight: true },
      { href: '/leader/teams', label: 'الفرق', icon: Users },
      { href: '/profile', label: 'ملفي', icon: User },
    ];
  } else if (isMember) {
    tabs = [
      { href: '/dashboard', label: 'لوحتي', icon: Compass },
      { href: '/card', label: 'بطاقتي', icon: QrCode, highlight: true },
      { href: '/team', label: 'فريقي', icon: Users },
      { href: '/profile', label: 'ملفي', icon: User },
    ];
  } else {
    tabs = [
      { href: '/', label: 'الرئيسية', icon: Home },
      { href: '/register', label: 'انضمام', icon: Compass, highlight: true },
      { href: '/login', label: 'دخول', icon: LogIn },
    ];
  }

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-sand/60 pb-safe md:hidden shadow-lg no-print">
      <div className="flex items-center justify-around h-16 px-2 max-w-md mx-auto">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || (tab.href !== '/dashboard' && tab.href !== '/' && tab.href !== '/leader' && tab.href !== '/super-admin' && pathname?.startsWith(tab.href));
          const Icon = tab.icon;

          if (tab.highlight) {
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex flex-col items-center justify-center -mt-6 group"
              >
                <div
                  className={clsx(
                    'w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg transition-transform active:scale-95 border-4 border-cream',
                    isActive ? 'bg-forest' : 'bg-orange'
                  )}
                >
                  <Icon className="w-7 h-7" />
                </div>
                <span className="text-[11px] font-bold text-forest mt-1">{tab.label}</span>
              </Link>
            );
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                'flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[48px]',
                isActive ? 'text-forest font-bold' : 'text-charcoal/60 hover:text-charcoal'
              )}
            >
              <div className="relative">
                <Icon className={clsx('w-5 h-5 transition-transform', isActive && 'scale-110 text-emerald')} />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-emerald" />
                )}
              </div>
              <span className="text-[11px] mt-1">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
