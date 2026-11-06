import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/lib/actions/result';
import { CONFIG_MISSING_MESSAGE, getBackendMode } from '@/lib/config/runtime';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getUserRoles } from '@/lib/supabase/supabase-service';
import type { UserRoleType } from '@/types';

export const ADMIN_ROLES: UserRoleType[] = ['super_admin', 'admin'];
export const STAFF_ROLES: UserRoleType[] = ['super_admin', 'admin', 'attendance_leader'];
export const ANY_ROLE: UserRoleType[] = ['super_admin', 'admin', 'attendance_leader', 'member'];

export interface SessionContext {
  mode: 'demo' | 'supabase';
  userId: string;
  email?: string;
  roles: UserRoleType[];
  /** Per-request, RLS-bound client (anon key + user's JWT). Null only in explicit local demo mode. */
  client: SupabaseClient | null;
}

/**
 * Server-side authentication + authorization. Call this at the top of EVERY protected server action.
 *
 *  - Production / unconfigured  -> fails closed (CONFIG_MISSING), never grants anything.
 *  - Local demo (explicit flag, non-production only) -> a fixed non-super 'admin'+'member' demo identity.
 *  - Supabase -> identity comes from supabase.auth.getUser() (validated against the Auth server),
 *    roles come from the user_roles table. Nothing is read from headers or client-supplied values,
 *    and no role is ever granted by default: an authenticated user with no role rows is FORBIDDEN.
 */
export async function requireSession(allowed: UserRoleType[] = ANY_ROLE): Promise<SessionContext> {
  const mode = getBackendMode();

  if (mode === 'misconfigured') {
    throw new AppError('CONFIG_MISSING', CONFIG_MISSING_MESSAGE);
  }

  if (mode === 'demo') {
    const roles: UserRoleType[] = ['super_admin', 'admin', 'attendance_leader', 'member'];
    if (!roles.some((r) => allowed.includes(r))) {
      throw new AppError('FORBIDDEN', 'ليس لديك الصلاحية للقيام بهذه العملية.');
    }
    return { mode: 'demo', userId: 'demo-user', roles, client: null };
  }

  const client = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    throw new AppError('UNAUTHENTICATED', 'يجب تسجيل الدخول للمتابعة.');
  }

  const roles = await getUserRoles(client, user.id);
  if (!roles.some((r) => allowed.includes(r))) {
    throw new AppError('FORBIDDEN', 'ليس لديك الصلاحية للقيام بهذه العملية.');
  }

  return { mode: 'supabase', userId: user.id, email: user.email, roles, client };
}

export function hasRole(ctx: SessionContext, ...roles: UserRoleType[]): boolean {
  return ctx.roles.some((r) => roles.includes(r));
}

/**
 * Backward-compatible role guard. In production, delegates to requireSession and fails closed
 * if Supabase is unconfigured or unauthorized.
 */
export async function requireUserWithRole(allowed: UserRoleType[] = ANY_ROLE) {
  const ctx = await requireSession(allowed);
  return {
    isDemo: ctx.mode === 'demo',
    roles: ctx.roles,
    userId: ctx.userId,
    email: ctx.email,
  };
}
