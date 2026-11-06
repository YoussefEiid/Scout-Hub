'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, QrCode, Users, ShieldCheck } from 'lucide-react';
import { clsx } from 'clsx';

interface BottomMobileNavProps {
  currentRole?: string;
}

export function BottomMobileNav({ currentRole = 'member' }: BottomMobileNavProps) {
  const pathname = usePathname();
  const isStaff = currentRole === 'admin' || currentRole === 'super_admin' || currentRole === 'attendance_leader';

  interface NavTab {
    href: string;
    label: string;
    icon: React.ElementType;
    highlight?: boolean;
  }

  const memberTabs: NavTab[] = [
    { href: '/dashboard', label: 'لوحتي', icon: Compass },
    { href: '/card', label: 'بطاقتي', icon: QrCode },
    { href: '/team', label: 'فريقي', icon: Users },
  ];

  const staffTabs: NavTab[] = [
    { href: '/dashboard', label: 'لوحتي', icon: Compass },
    { href: '/card', label: 'بطاقتي', icon: QrCode },
    { href: '/admin/scanner', label: 'الماسح', icon: QrCode, highlight: true },
    { href: '/admin/teams', label: 'الفرق', icon: Users },
    { href: '/admin/reports', label: 'الإدارة', icon: ShieldCheck },
  ];

  const tabs = isStaff ? staffTabs : memberTabs;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-sand/60 pb-safe md:hidden shadow-lg no-print">
      <div className="flex items-center justify-around h-16 px-2 max-w-md mx-auto">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || (tab.href !== '/dashboard' && pathname?.startsWith(tab.href));
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
