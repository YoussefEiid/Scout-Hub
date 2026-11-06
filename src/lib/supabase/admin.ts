import { createClient } from '@supabase/supabase-js';
import { AppError } from '@/lib/actions/result';
import { isServiceRoleConfigured } from '@/lib/config/runtime';

/**
 * PRIVILEGED client (service-role key, bypasses RLS). SERVER ONLY.
 *
 * Audit (Phase 2): the only sanctioned caller is registration (`src/lib/auth/registration.ts`),
 * which uses it for exactly two things: deleting a just-created auth user when profile creation
 * fails (compensation) and calling `register_member_profile` (EXECUTE granted to service_role only).
 * tests/security/static-guards.test.ts fails the build if any other file imports this module, if a
 * 'use client' file imports it, or if the key name appears in client-reachable code.
 *
 * The key is read from a non-NEXT_PUBLIC variable, so Next.js never inlines it into browser bundles.
 */
export function createAdminClient() {
  if (!isServiceRoleConfigured()) {
    throw new AppError('CONFIG_MISSING', 'مفتاح الخدمة (SUPABASE_SERVICE_ROLE_KEY) غير مضبوط على الخادم.');
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
