import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { isDemoModeEnabled, isSupabaseConfigured } from '@/lib/config/runtime';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminRoute = pathname.startsWith('/admin');
  const isMemberRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/card') ||
    pathname.startsWith('/team') ||
    pathname.startsWith('/attendance-history');

  // Public routes (landing, login, register, static assets) pass through directly
  if (!isAdminRoute && !isMemberRoute) {
    return NextResponse.next();
  }

  // 1. Explicit local-dev demo mode (strictly disabled in production)
  if (isDemoModeEnabled()) {
    return NextResponse.next();
  }

  // 2. Production or unconfigured: fail closed
  if (!isSupabaseConfigured()) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'config_missing');
    return NextResponse.redirect(loginUrl);
  }

  // 3. Supabase configured: check session authoritatively
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: '', ...options });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        response.cookies.set({ name, value: '', ...options });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/dashboard/:path*',
    '/card/:path*',
    '/team/:path*',
    '/attendance-history/:path*',
  ],
};
