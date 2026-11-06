import React from 'react';
import Link from 'next/link';
import { ShieldCheck, ArrowRight, Clock, User, Layers } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireSession, SUPER_ADMIN_ROLES } from '@/lib/auth/auth-service';

export default async function SuperAdminAuditPage() {
  const ctx = await requireSession(SUPER_ADMIN_ROLES);

  let logs: any[] = [];
  if (ctx.mode === 'supabase') {
    const { data } = await ctx.client!
      .from('audit_logs')
      .select('*, profiles(full_name, member_number)')
      .order('created_at', { ascending: false })
      .limit(50);
    logs = data ?? [];
  }

  return (
    <div className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/super-admin" className="text-xs text-charcoal/60 hover:text-forest flex items-center gap-1 font-bold">
              <span>لوحة الإدارة العامة</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <span className="text-xs text-charcoal/40">/</span>
            <span className="text-xs font-bold text-forest">سجل التدقيق الأمني</span>
          </div>
          <h1 className="text-2xl font-black text-forest">سجل التدقيق والرقابة الأمنية (Audit Logs) 🛡️</h1>
          <p className="text-xs text-charcoal/70">
            تتبع غير قابل للتعديل لكافة العمليات الحساسة (إنشاء الحسابات، تكليف الصلاحيات، تسجيل الحضور، وتدوير الرموز)
          </p>
        </div>

        <Badge variant="orange" size="md">
          {logs.length} سجل أخير
        </Badge>
      </div>

      <Card className="bg-white rounded-3xl border-sand scout-card-shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-sand/30 text-forest font-bold border-b border-sand/60">
              <tr>
                <th className="py-3 px-4">التوقيت</th>
                <th className="py-3 px-4">العملية الموثقة</th>
                <th className="py-3 px-4">المنفّذ (Actor)</th>
                <th className="py-3 px-4">الكيان المتأثر</th>
                <th className="py-3 px-4">تفاصيل العملية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand/40 font-mono text-[11px]">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-charcoal/50 font-sans">
                    لا توجد سجلات تدقيق حتى الآن
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-cream/20 transition-colors">
                    <td className="py-3 px-4 text-charcoal/70 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('ar-EG')}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-forest font-sans">{log.action}</span>
                    </td>
                    <td className="py-3 px-4 font-sans font-bold text-forest">
                      {log.profiles?.full_name || log.actor_id?.slice(0, 8) || 'النظام'}
                    </td>
                    <td className="py-3 px-4 text-charcoal/80">
                      <span className="bg-sand/30 px-2 py-0.5 rounded-md">
                        {log.entity_type} {log.entity_id ? `(${log.entity_id.slice(0, 8)}...)` : ''}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-charcoal/60 max-w-xs truncate" title={JSON.stringify(log.details)}>
                      {JSON.stringify(log.details)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
