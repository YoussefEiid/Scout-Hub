import { createBrowserClient } from '@supabase/ssr';
import { getCanonicalSupabaseUrl } from '@/lib/config/runtime';

/**
 * Browser client (ANON key only). Used for sign-in, password reset and session handling.
 * Returns null when Supabase is not configured so UI can show a setup message instead of crashing.
 * No privileged credential can ever reach this module.
 */
export function createClient() {
  const url = getCanonicalSupabaseUrl();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createBrowserClient(url, anonKey);
}
