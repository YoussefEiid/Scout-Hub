/**
 * Backend mode resolution — the ONLY place that decides between real Supabase and demo data.
 *
 *   demo          Local development / test only. Requires (SCOUT_DEMO_MODE=true OR NODE_ENV=test)
 *                 AND strictly NODE_ENV !== 'production'.
 *   supabase      Real backend. Chosen whenever demo is not enabled and Supabase is fully configured.
 *   misconfigured Supabase variables missing and demo not allowed -> every protected operation
 *                 fails closed with CONFIG_MISSING. There is no silent fallback.
 *
 * Inputs are server-side environment variables only. Nothing here reads request headers,
 * cookies or any other client-controlled value.
 */

export type BackendMode = 'demo' | 'supabase' | 'misconfigured';

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Demo is strictly forbidden in production. Permitted in non-production only when requested or in test. */
export function isDemoModeEnabled(): boolean {
  if (isProductionRuntime()) return false;
  return process.env.SCOUT_DEMO_MODE === 'true' || process.env.NODE_ENV === 'test';
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function isServiceRoleConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getBackendMode(): BackendMode {
  if (isDemoModeEnabled()) return 'demo';
  if (isSupabaseConfigured()) return 'supabase';
  return 'misconfigured';
}

/** Arabic, actionable message shown when a protected feature is used without configuration. */
export const CONFIG_MISSING_MESSAGE =
  'لم يتم إعداد قاعدة البيانات بعد. أضف NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY في متغيرات البيئة ثم أعد التشغيل (راجع SCOUT_HUB_DEPLOYMENT.md).';
