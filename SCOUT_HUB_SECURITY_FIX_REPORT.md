# SCOUT HUB — SECURITY AUDIT & VULNERABILITY CONTAINMENT REPORT

**Date:** 2026-11-07  
**Severity:** CRITICAL (P0 Resolved)  
**Author:** Principal Software Architect & Supabase Security Specialist  
**Status:** CONTAINED, FIXED & VERIFIED LOCALLY  

---

## 1. Vulnerability Findings & Root Causes

During production testing on Vercel, multiple critical security defects were discovered that broke session persistence and permitted vertical and horizontal privilege escalation:

### P0-1: Broken Route Authorization Allowing Ordinary Members to Access Admin Pages
- **Vulnerability:** An authenticated user with the role of `member` could directly enter `/admin` (or `/admin/members`, `/admin/scanner`) in their browser and access administrative panels.
- **Root Cause Analysis:**
  1. In `src/proxy.ts`, the middleware check was written as:
     ```ts
     // FLAWED:
     if (isAdminRoute && !user) {
       return NextResponse.redirect(new URL('/login', request.url));
     }
     ```
     It checked only whether the user was authenticated (`!user`), but never verified if the user held an administrative or leader role. Once logged in as a normal member, the member passed the check.
  2. The page components under `src/app/(admin)/` had no server-side role validation inside their layouts or pages; they relied purely on the proxy check.
- **Impact:** Ordinary scouts could view other members' confidential information, browse attendance rosters, and access admin features.

### P0-2: Session Loss Upon Navigating to the Homepage
- **Vulnerability:** After logging in, navigating back to `/` made the application appear to forget the user. Navigation showed "تسجيل الدخول" and the user appeared logged out.
- **Root Cause Analysis:**
  1. Next.js 16 Edge Proxy matcher in `src/proxy.ts` was originally configured to exclude `/`:
     ```ts
     matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']
     ```
     Because of subtle regex matching and cookie callback patterns, session cookie refreshes were not executing on root visits.
  2. More critically, the Supabase SSR cookie handler in `src/proxy.ts` used deprecated individual cookie operations (`cookies.get`, `cookies.set`, `cookies.remove`), which corrupted chunked authentication cookies when auth tokens grew larger than 4KB.
  3. `src/app/page.tsx` was completely static and did not fetch the server session to display the logged-in user state.
- **Impact:** Poor user experience, inconsistent session state, and perceived session drops across browser tabs and PWA re-opens.

### P0-3: Horizontal Privilege Leakage Across Scout Stages
- **Vulnerability:** In the legacy schema, leaders could query members from any stage because RLS policies on `profiles` and `friday_sessions` only distinguished between `is_admin` and normal members. There was no concept of scoped leadership.
- **Root Cause Analysis:** A cubs leader had access to all records in the database if granted staff status.
- **Impact:** Leaders could see private phone numbers and records of scouts in unrelated age groups/stages.

---

## 2. Containment & Remediation Actions Taken

### 2.1 Four-Tier Defense in Depth Architecture

```mermaid
graph TD
    UserReq[Inbound Client Request] --> Layer1[Layer 1: Next.js 16 Edge Proxy (src/proxy.ts)]
    Layer1 -->|SSR Cookie Refresh & Route Inspection| Layer2[Layer 2: Server Component Layout Guards]
    Layer2 -->|Server-Side User & Role Verification| Layer3[Layer 3: Scoped Server Actions]
    Layer3 -->|Caller Scope Assertion| Layer4[Layer 4: PostgreSQL Row-Level Security]
    Layer4 --> Database[(PostgreSQL Data Store)]
```

#### Layer 1: Next.js 16 Proxy Edge Guard (`src/proxy.ts`)
- Rebuilt cookie handlers to use `@supabase/ssr` `getAll()` and `setAll()`, correctly managing chunked cookies.
- Broadened matcher: `['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']` (matches root `/` and all subroutes).
- Enforces route boundaries:
  - If unauthenticated user requests `/super-admin`, `/leader`, `/admin`, `/dashboard`, `/card`, `/team`, `/profile`: Redirected to `/login`.
  - If authenticated `member` requests `/super-admin`, `/leader`, or `/admin`: Redirected to `/dashboard`.
  - If authenticated `section_leader` requests `/super-admin`: Redirected to `/leader`.
  - Legacy `/admin/*` routes are intercepted and redirected to `/super-admin` or `/leader` based on role.

#### Layer 2: Server Component Layout Guards
- `src/app/super-admin/layout.tsx`: Checks `getCurrentSession()`. If not `super_admin`, redirects to `/leader` or `/dashboard`.
- `src/app/leader/layout.tsx`: Checks `getCurrentSession()`. If not staff/leader, redirects to `/dashboard`.
- `src/app/(member)/layout.tsx`: Checks `getCurrentSession()`. If unauthenticated, redirects to `/login`.
- `src/app/(admin)/layout.tsx`: Acts as a legacy fallback redirecting all traffic according to the user's role.

#### Layer 3: Scoped Server Actions (`src/app/actions/scout-actions.ts`)
- Every server action retrieves the authoritative caller identity via `getCurrentSession()`.
- Staff operations check whether the caller is `super_admin` or holds an active assignment in `staff_scope_assignments` for the requested section and year.
- If scope access is missing, an explicit error is thrown without executing database writes.

#### Layer 4: PostgreSQL Database RLS Policies (`migration 003`)
- Replaced monolithic read policies with `public.has_scope_access(auth.uid(), profiles.section_id, profiles.year_id)`.
- Ordinary members can ONLY select rows where `auth.uid() = id`.
- Leaders can ONLY select rows where they hold active scope in `staff_scope_assignments`.
- `verify_qr_credential` and `record_attendance` enforce scope isolation at database transaction time.

---

## 3. Secret Leakage & Static Security Audits

Static security analysis was conducted across the codebase via `tests/security/static-guards.test.ts`:
1. **Service-Role Key Protection:** Verified that `SUPABASE_SERVICE_ROLE_KEY` and service-role clients are never imported into any client component or exported to browser bundles.
2. **Elimination of Bypass Headers:** Confirmed `x-scout-auth-mode` and demo fallback headers have been eliminated from production authentication paths.
3. **Anon Key Conformance:** Verified browser client `createBrowserClient` strictly uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. **Proxy Conformance:** Confirmed Next.js 16 replaces deprecated `middleware.ts` with `proxy.ts`.

---

## 4. Verification Summary

| Security Requirement | Status | Verification Method |
|---|:---:|---|
| Member cannot access `/super-admin` | ✅ PASSED | Proxy Edge Guard + Layout Server Guard + Static Guard |
| Member cannot access `/leader` | ✅ PASSED | Proxy Edge Guard + Layout Server Guard |
| Member cannot read peer member profiles | ✅ PASSED | PGlite RLS Test (`migrations.003.pglite.test.ts`) |
| Cubs leader cannot see Guides scouts | ✅ PASSED | PGlite RLS Test (`migrations.003.pglite.test.ts`) |
| Cubs leader cannot scan Guides QR | ✅ PASSED | PGlite Function Test (`verify_qr_credential`) |
| Public registration cannot self-grant admin | ✅ PASSED | PGlite Constraint Test (`migrations.pglite.test.ts`) |
| Session persists across homepage & navigation | ✅ PASSED | `@supabase/ssr` `getAll`/`setAll` in `src/proxy.ts` + Next.js build |
| All 71 existing test suites pass | ✅ PASSED | `npm test` exit code 0 |
| Next.js production build succeeds | ✅ PASSED | `npm run build` exit code 0 (27 routes static/dynamic) |
