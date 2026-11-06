'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Compass,
  User,
  Users,
  BarChart3,
  QrCode,
  ShieldAlert,
  LogOut,
  Layers,
  UserCheck,
  Calendar,
  Settings,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface TopNavbarProps {
  currentRole?: string;
  userName?: string;
}

export function TopNavbar({ currentRole: initialRole, userName: initialUserName }: TopNavbarProps) {
  const router = useRouter();
  const [role, setRole] = useState<string | undefined>(initialRole);
  const [name, setName] = useState<string | undefined>(initialUserName);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const supabase = createClient();
    if (!supabase) return;

    // Check if we need to hydrate user info
    if (!initialRole || !initialUserName) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          setName((prev) => prev || user.user_metadata?.full_name || user.email?.split('@')[0] || 'كشاف');
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
        } else {
          setRole(undefined);
          setName(undefined);
        }
      });
    }
  }, [initialRole, initialUserName]);

  const handleLogout = async () => {
    const supabase = createClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.push('/login');
    router.refresh();
  };

  const isSuperAdmin = role === 'super_admin';
  const isSectionLeader = role === 'section_leader' || role === 'admin';
  const isAssistant = role === 'assistant_leader' || role === 'attendance_leader';
  const isStaff = isSuperAdmin || isSectionLeader || isAssistant;
  const isMember = role === 'member';
  const isLoggedIn = Boolean(name || role);

  return (
    <header className="sticky top-0 z-40 w-full bg-forest text-cream border-b border-forest-hover shadow-md">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand Logo & Name */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-xl bg-orange flex items-center justify-center text-white shadow-sm transition-transform group-hover:scale-105">
            <Compass className="w-6 h-6 animate-pulse" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-black tracking-wide text-sand-light font-cairo">كشافة هب</span>
            <span className="text-[10px] text-cream/70 -mt-1">منصة المغامرة الكشفية</span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1 text-sm font-semibold">
          {/* SUPER ADMIN NAVIGATION */}
          {isSuperAdmin && (
            <>
              <Link
                href="/super-admin"
                className="px-3 py-2 rounded-lg text-cream/90 hover:text-white hover:bg-forest-hover transition-colors flex items-center gap-1.5"
              >
                <Layers className="w-4 h-4 text-orange" />
                <span>الرئيسية</span>
              </Link>
              <Link
                href="/super-admin/sections"
                className="px-3 py-2 rounded-lg text-cream/90 hover:text-white hover:bg-forest-hover transition-colors flex items-center gap-1.5"
              >
                <Compass className="w-4 h-4 text-emerald-light" />
                <span>الأقسام والسنوات</span>
              </Link>
              <Link
                href="/super-admin/leaders"
                className="px-3 py-2 rounded-lg text-cream/90 hover:text-white hover:bg-forest-hover transition-colors flex items-center gap-1.5"
              >
                <UserCheck className="w-4 h-4 text-sand" />
                <span>القادة والصلاحيات</span>
              </Link>
              <Link
                href="/super-admin/members"
                className="px-3 py-2 rounded-lg text-cream/90 hover:text-white hover:bg-forest-hover transition-colors flex items-center gap-1.5"
              >
                <Users className="w-4 h-4 text-sand-light" />
                <span>كل الأعضاء</span>
              </Link>
              <Link
                href="/super-admin/attendance"
                className="px-3 py-2 rounded-lg text-cream/90 hover:text-white hover:bg-forest-hover transition-colors flex items-center gap-1.5"
              >
                <Calendar className="w-4 h-4 text-orange" />
                <span>الاجتماعات والحضور</span>
              </Link>
            </>
          )}

          {/* LEADER NAVIGATION */}
          {!isSuperAdmin && isStaff && (
            <>
              <Link
                href="/leader"
                className="px-3 py-2 rounded-lg text-cream/90 hover:text-white hover:bg-forest-hover transition-colors flex items-center gap-1.5"
              >
                <Compass className="w-4 h-4 text-orange" />
                <span>لوحة القائد</span>
              </Link>
              <Link
                href="/leader/members"
                className="px-3 py-2 rounded-lg text-cream/90 hover:text-white hover:bg-forest-hover transition-colors flex items-center gap-1.5"
              >
                <Users className="w-4 h-4 text-sand" />
                <span>كشافين القسم</span>
              </Link>
              <Link
                href="/leader/scanner"
                className="px-3 py-1.5 rounded-lg bg-orange text-white hover:bg-orange-hover transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <QrCode className="w-4 h-4" />
                <span>ماسح الحضور</span>
              </Link>
              <Link
                href="/leader/teams"
                className="px-3 py-2 rounded-lg text-cream/90 hover:text-white hover:bg-forest-hover transition-colors flex items-center gap-1.5"
              >
                <Users className="w-4 h-4 text-emerald-light" />
                <span>فرق القسم</span>
              </Link>
              <Link
                href="/leader/reports"
                className="px-3 py-2 rounded-lg text-cream/90 hover:text-white hover:bg-forest-hover transition-colors flex items-center gap-1.5"
              >
                <BarChart3 className="w-4 h-4 text-sand-light" />
                <span>تقارير الحضور</span>
              </Link>
            </>
          )}

          {/* MEMBER NAVIGATION */}
          {(!isStaff && isMember) && (
            <>
              <Link
                href="/dashboard"
                className="px-3 py-2 rounded-lg text-cream/90 hover:text-white hover:bg-forest-hover transition-colors flex items-center gap-1.5"
              >
                <Compass className="w-4 h-4 text-orange" />
                <span>لوحتي</span>
              </Link>
              <Link
                href="/card"
                className="px-3 py-2 rounded-lg text-cream/90 hover:text-white hover:bg-forest-hover transition-colors flex items-center gap-1.5"
              >
                <QrCode className="w-4 h-4 text-emerald-light" />
                <span>بطاقتي الرقمية</span>
              </Link>
              <Link
                href="/team"
                className="px-3 py-2 rounded-lg text-cream/90 hover:text-white hover:bg-forest-hover transition-colors flex items-center gap-1.5"
              >
                <Users className="w-4 h-4 text-sand" />
                <span>فريقي</span>
              </Link>
              <Link
                href="/profile"
                className="px-3 py-2 rounded-lg text-cream/90 hover:text-white hover:bg-forest-hover transition-colors flex items-center gap-1.5"
              >
                <User className="w-4 h-4 text-sand-light" />
                <span>ملفي الشخصي</span>
              </Link>
            </>
          )}

          {/* GUEST NAVIGATION */}
          {!isLoggedIn && (
            <>
              <Link
                href="/"
                className="px-3 py-2 rounded-lg text-cream/90 hover:text-white hover:bg-forest-hover transition-colors"
              >
                عن المنصة
              </Link>
              <Link
                href="/register"
                className="px-3 py-2 rounded-lg text-sand-light hover:text-white hover:bg-forest-hover transition-colors"
              >
                انضم إلينا
              </Link>
            </>
          )}
        </nav>

        {/* User Account & Actions Pill */}
        <div className="flex items-center gap-2">
          {isLoggedIn ? (
            <div className="flex items-center gap-2">
              <Link
                href="/profile"
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-forest-hover/80 border border-sand/20 text-xs hover:border-sand transition-all"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-light animate-ping" />
                <span className="font-bold text-sand-light truncate max-w-[120px]">{name || 'مستخدم'}</span>
                {isSuperAdmin ? (
                  <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded-full font-bold">
                    قائد عام
                  </span>
                ) : isStaff ? (
                  <span className="text-[10px] bg-orange text-white px-1.5 py-0.5 rounded-full font-bold">
                    قائد مرحلة
                  </span>
                ) : (
                  <span className="text-[10px] bg-emerald-light/20 text-emerald-light px-1.5 py-0.5 rounded-full font-bold">
                    كشاف
                  </span>
                )}
              </Link>

              <button
                onClick={handleLogout}
                title="تسجيل الخروج"
                className="p-2 rounded-xl bg-forest-hover hover:bg-red-500/20 text-cream/70 hover:text-red-400 transition-colors border border-transparent hover:border-red-500/30"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-3.5 py-1.5 rounded-xl bg-emerald hover:bg-emerald-hover text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
              >
                <User className="w-3.5 h-3.5" />
                <span>دخول</span>
              </Link>
              <Link
                href="/register"
                className="hidden sm:inline-flex px-3.5 py-1.5 rounded-xl bg-orange hover:bg-orange-hover text-white text-xs font-bold transition-all shadow-sm"
              >
                <span>انضم كفرد</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
