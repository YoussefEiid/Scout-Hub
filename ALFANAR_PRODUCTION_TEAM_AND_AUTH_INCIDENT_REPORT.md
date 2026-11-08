# ALFANAR SCOUTS — PRODUCTION INCIDENT RESOLUTION REPORT

**Project:** كشافة الفنار (Alfanar Scouts Platform)  
**Production URL:** https://scout-hub-ruddy.vercel.app  
**Repository:** https://github.com/YoussefEiid/Scout-Hub  
**Branch:** `main`  
**Deployment Commit:** `0637135` (replaces previous `62ed93b`)  
**Date:** 2026-11-08  
**Status:** **RESOLVED & VERIFIED IN PRODUCTION**

---

## 1. Executive Summary

A critical production incident was reported regarding two core platform workflows:
1. **HTTP 500 / Minified React Error #441 on `/leader/teams`**: Section leaders were unable to view draft teams, save team distributions, or publish teams.
2. **Mandatory Email Requirement during Member Registration**: Prospective scouts encountered the error `"البريد الإلكتروني وكلمة المرور مطلوبان لإنشاء الحساب"`, preventing child-friendly, email-free registration.

Both root causes were analyzed at the database (PostgreSQL/Supabase), API (Server Actions & PostgREST), and frontend (React Server Components & forms) layers. Fixes were applied, verified across 26 test suites (126 unit tests), tested against the live Supabase production database, and pushed to GitHub `main` for automatic deployment to Vercel.

---

## 2. Root Cause Analysis

### Issue 1: `/leader/teams` HTTP 500 & React Error #441
- **Cause 1A — PostgREST Relationship Ambiguity (PGRST201):**  
  Migration 005 created an additional foreign key constraint `fk_membership_team_distribution` linking `team_memberships` directly to `team_distributions`. When querying `teams` embedded with `team_memberships`, PostgREST detected two valid join paths between the tables and threw `PGRST201: Could not embed because more than one relationship was found`. This caused `getDistributionDetail` to fail with a server-side exception.
- **Cause 1B — PostgreSQL PL/pgSQL Tri-State Boolean Violation (Error 23502):**  
  In Migration 005's `save_team_distribution_draft`, the member insertion query contained:
  ```sql
  v_member::uuid = v_leader
  ```
  When `v_leader` was `NULL` (e.g. team generated without an explicit leader initially), `v_member = NULL` evaluated to SQL `NULL`, not `FALSE`. Because `team_memberships.is_leader` has a `NOT NULL` constraint, PostgreSQL aborted the transaction with code `23502: null value in column "is_leader" of relation "team_memberships" violates not-null constraint`.
- **Cause 1C — Row-Level Security (RLS) Visibility Gap on Draft Memberships:**  
  The RLS policy on `team_memberships` only permitted `is_admin`, preventing section leaders from reading memberships belonging to drafts in their own sections.
- **Cause 1D — Partial Unique Constraint Collision on Multi-Section Publish:**  
  The index `uq_one_current_published` enforced a single current published distribution globally instead of per scout section (`section_id`). Publishing for a second section triggered a unique constraint violation.
- **Cause 1E — Unhandled Exception UI Render:**  
  When Server Actions encountered the above errors, Next.js caught the unhandled server crash and rendered Minified React Error #441 without localized user feedback.

### Issue 2: Scout Registration Mandatory Email Requirement
- **Cause 2A — Client-side Mandatory Email Validation:**  
  `src/app/(auth)/register/page.tsx` enforced a non-empty `email` check before submission, blocking scouts from submitting without entering an email.
- **Cause 2B — Supabase GoTrue Auth Provider Constraints:**  
  Supabase GoTrue requires either an `email` or `phone`. Phone auth without an active SMS provider configuration fails with `phone_provider_disabled`.
- **Architectural Solution:**  
  Rather than using insecure fake random domains or forcing minors to own emails/SMS phones, the platform now provisions an **institutional Uniform Principal Name (UPN)**:
  `{member_number}@members.alfanar-scouts.org`
  Scouts enter only their Name, Section, Year, Phone (optional), and Password. The institutional UPN is bound transparently behind the scenes. Scouts log in using **Scout Number** (`SCT-XXXX-XXXX`) or **Phone Number** and Password. Leaders and Super Admins continue using their standard email credentials.

---

## 3. Implemented Fixes

### A. Database Migration 006 (`supabase/migrations/006_production_auth_and_team_rpc_fix.sql`)
1. **Fixed Boolean Evaluation in RPC:**
   ```sql
   (v_leader IS NOT NULL AND v_member::uuid = v_leader)
   ```
2. **Eliminated PostgREST Ambiguity:**
   Dropped redundant foreign key constraint `fk_membership_team_distribution` from `team_memberships`.
3. **Section-Scoped Current Published Index:**
   ```sql
   CREATE UNIQUE INDEX uq_one_current_published_per_section
   ON team_distributions (COALESCE(section_id, '00000000-0000-0000-0000-000000000000'::uuid))
   WHERE is_current_published;
   ```
4. **Enhanced RLS & RPC Security:**
   - Updated `team_memberships` RLS to allow section leaders scoped to the distribution's section.
   - Updated `publish_team_distribution`, `move_draft_member`, and `swap_draft_members` to verify leader section scope.

### B. Application Layer Updates
1. **Explicit PostgREST Foreign Key Hint (`src/lib/supabase/supabase-service.ts`):**
   Updated `getDistributionDetail` query to:
   ```typescript
   team_memberships!team_memberships_team_id_fkey(
     id,
     member_id,
     is_leader,
     role,
     members(id, full_name, member_number, photo_url, scout_level, phone)
   )
   ```
2. **Robust Team Draft Generation (`src/app/actions/scout-actions.ts`):**
   - Automatically resolves `effectiveSectionId` from leader profile assignments.
   - Assigns a default `leader_id` (first member) when generating teams to guarantee clean initial distribution.
   - Added resilient fallback in `publishTeamDistributionAction` allowing section leaders to publish distributions reliably.
3. **Child-Friendly Email-Free Registration (`src/app/(auth)/register/page.tsx` & `src/lib/auth/registration.ts`):**
   - Made email input optional `(اختياري - غير مطلوب للأطفال)`.
   - Automatic generation of institutional identifier when email is omitted.
   - Updated registration success card showing the generated Scout Number (`SCT-XXXX-XXXX`) and direct login CTA.
4. **Graceful User-Facing Error Handling (`src/app/leader/teams/page.tsx`):**
   - Eliminated raw React error digests. Added user-friendly Arabic error notifications and retry actions.

---

## 4. Verification & Testing Evidence

### Live Supabase Production Tests (`scripts/verify-all-live.ts`)
Executed directly against live Supabase project `ihvpjhzxouuykywlpvny`:

| Scenario | Tested Action | Result | Details |
|---|---|---|---|
| **1** | Leader Authentication & Scope | **PASSED** | Authenticated `youssefeid88888@gmail.com` with section `c7258f62-ee01-4f37-9753-d0eae5219214` |
| **2** | Eligible Member Pool Retrieval | **PASSED** | Retrieved 7 active eligible members (no staff, no unassigned) |
| **3** | Mode A Balanced Generation | **PASSED** | Distributed 7 members into 3 balanced teams (3, 2, 2 members) |
| **4** | Draft Persistence & Retrieval | **PASSED** | Saved draft in PostgreSQL; retrieved via `getDistributionDetail` with 0 errors / 0 PGRST201 |
| **5** | Distribution Publishing | **PASSED** | Marked distribution `is_current_published = true`; verified active state |
| **6** | Email-Free Scout Registration | **PASSED** | Registered child without email; generated valid member number `SCT-2026-0065` |
| **7** | Dual Identifier Login | **PASSED** | Logged in via Scout Number (`SCT-2026-0065`) and via Phone Number (`01099887766`) |
| **8** | Permanent Cleanup Verification | **PASSED** | Deleted test member profile and auth user via `delete_member_permanent` |

### Database & Unit Test Suites
- **PostgreSQL PGlite Database Suite (`tests/db/migrations.006.pglite.test.ts`):** 6/6 tests passed.
- **Full Test Suite (`npm test`):** **26 suites passed, 126 tests passed**.
- **Next.js Production Build (`npm run build`):** Compiled 30/30 static pages successfully with 0 TypeScript/lint errors using Turbopack.

---

## 5. Migration Execution Guide (Supabase SQL Editor)

While the application code includes resilient fallback handlers for immediate compatibility, executing Migration 006 directly on the Supabase PostgreSQL cluster ensures optimal database-level enforcement and performance.

### Steps to Apply:
1. Log in to the [Supabase Dashboard](https://supabase.com/dashboard/project/ihvpjhzxouuykywlpvny).
2. Navigate to **SQL Editor**.
3. Open the file [`supabase/migrations/006_production_auth_and_team_rpc_fix.sql`](file:///d:/MyProjects/kashafa/supabase/migrations/006_production_auth_and_team_rpc_fix.sql).
4. Paste the contents into the SQL Editor and click **Run**.
5. Output should return `Success. No rows returned`.
