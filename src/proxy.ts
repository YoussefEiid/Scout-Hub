import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isDemoModeEnabled, isSupabaseConfigured, getCanonicalSupabaseUrl } from '@/lib/config/runtime';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isSuperAdminRoute = pathname.startsWith('/super-admin');
  const isLeaderRoute = pathname.startsWith('/leader');
  const isLegacyAdminRoute = pathname.startsWith('/admin');
  const isMemberRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/profile') ||
    pathname.startsWith('/card') ||
    pathname.startsWith('/team') ||
    pathname.startsWith('/attendance-history');
  const isAuthRoute = pathname === '/login' || pathname === '/register';

  const isProtectedRoute = isSuperAdminRoute || isLeaderRoute || isLegacyAdminRoute || isMemberRoute;

  // 1. Explicit local-dev demo mode (strictly non-production)
  if (isDemoModeEnabled()) {
    return NextResponse.next();
  }

  // 2. Production or unconfigured: fail closed on protected routes
  if (!isSupabaseConfigured()) {
    if (isProtectedRoute) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('error', 'config_missing');
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // 3. Supabase configured: check session authoritatively using modern SSR cookie handler
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = getCanonicalSupabaseUrl();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If unauthenticated:
  if (!user) {
    if (isProtectedRoute) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  // If authenticated, determine user roles
  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);

  const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
  const isSuperAdmin = roles.includes('super_admin');
  const isLeader =
    isSuperAdmin ||
    roles.includes('section_leader') ||
    roles.includes('assistant_leader') ||
    roles.includes('admin') ||
    roles.includes('attendance_leader');

  const defaultRedirect = isSuperAdmin ? '/super-admin' : isLeader ? '/leader' : '/dashboard';

  // Prevent authenticated users from opening login / register
  if (isAuthRoute) {
    return NextResponse.redirect(new URL(defaultRedirect, request.url));
  }

  // Legacy /admin route redirect based on server role
  if (isLegacyAdminRoute) {
    return NextResponse.redirect(new URL(defaultRedirect, request.url));
  }

  // Strict Super Admin route guard
  if (isSuperAdminRoute && !isSuperAdmin) {
    return NextResponse.redirect(new URL(isLeader ? '/leader' : '/dashboard', request.url));
  }

  // Strict Leader route guard
  if (isLeaderRoute && !isLeader) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets (images, icons)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
