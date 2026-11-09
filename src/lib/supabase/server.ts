import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { AppError } from '@/lib/actions/result';
import { CONFIG_MISSING_MESSAGE, isSupabaseConfigured } from '@/lib/config/runtime';

/**
 * Per-request Supabase client bound to the caller's session cookies and the ANON key.
 * All queries run as the signed-in user, so Row Level Security applies.
 *
 * Fails closed: throws CONFIG_MISSING if Supabase is not configured. It never returns null and never
 * falls back to demo data — callers decide the backend via getBackendMode() before calling this.
 */
export async function createServerSupabaseClient() {
  if (!isSupabaseConfigured()) {
    throw new AppError('CONFIG_MISSING', CONFIG_MISSING_MESSAGE);
  }

  let cookieStore: any = null;
  try {
    cookieStore = await cookies();
  } catch {
    // When invoked outside an active request context (e.g. test runner or isolated script)
    cookieStore = null;
  }

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore ? cookieStore.getAll() : [];
      },
      setAll(cookiesToSet) {
        if (!cookieStore) return;
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component render: session refresh is handled by proxy.ts.
        }
      },
    },
  });
}
