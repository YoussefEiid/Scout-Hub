'use client';

import React from 'react';
import Link from 'next/link';
import { Compass, User, Users, BarChart3, QrCode } from 'lucide-react';

interface TopNavbarProps {
  currentRole?: string;
  userName?: string;
}

export function TopNavbar({ currentRole = 'member', userName }: TopNavbarProps) {
  const isAdmin = currentRole === 'admin' || currentRole === 'super_admin';
  const isStaff = isAdmin || currentRole === 'attendance_leader';

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
            <span>بطاقتي</span>
          </Link>
          <Link
            href="/team"
            className="px-3 py-2 rounded-lg text-cream/90 hover:text-white hover:bg-forest-hover transition-colors flex items-center gap-1.5"
          >
            <Users className="w-4 h-4 text-sand" />
            <span>فريقي</span>
          </Link>

          {isStaff && (
            <div className="flex items-center gap-1 border-r border-forest-hover/80 pr-2 mr-2">
              <Link
                href="/admin/scanner"
                className="px-3 py-1.5 rounded-lg bg-orange text-white hover:bg-orange-hover transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <QrCode className="w-4 h-4" />
                <span>ماسح الجمعة</span>
              </Link>
              {isAdmin && (
                <Link
                  href="/admin/teams"
                  className="px-3 py-2 rounded-lg text-cream/90 hover:text-white hover:bg-forest-hover transition-colors flex items-center gap-1.5"
                >
                  <Users className="w-4 h-4 text-orange" />
                  <span>توزيع الفرق</span>
                </Link>
              )}
              {isAdmin && (
                <Link
                  href="/admin/reports"
                  className="px-3 py-2 rounded-lg text-cream/90 hover:text-white hover:bg-forest-hover transition-colors flex items-center gap-1.5"
                >
                  <BarChart3 className="w-4 h-4 text-emerald-light" />
                  <span>التقارير</span>
                </Link>
              )}
            </div>
          )}
        </nav>

        {/* User Account Pill */}
        <div className="flex items-center gap-2">
          {userName ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-forest-hover/80 border border-sand/20 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-light animate-ping" />
              <span className="font-bold text-sand-light truncate max-w-[120px]">{userName}</span>
              {isAdmin && (
                <span className="text-[10px] bg-orange text-white px-1.5 py-0.5 rounded-full font-bold">قائد</span>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="px-3.5 py-1.5 rounded-xl bg-emerald hover:bg-emerald-hover text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
            >
              <User className="w-3.5 h-3.5" />
              <span>دخول</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
