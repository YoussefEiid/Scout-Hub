# SCOUT HUB — PRODUCTION ROLLOUT CHECKLIST & AUDIT REPORT

**Document Version:** 1.0.0  
**Date:** 2026-11-07  
**Project:** Scout Hub (كشافة هب)  
**Target Environment:** Supabase PostgreSQL (Free Tier) & Vercel Production  
**Sign-off Status:** READY FOR PRODUCTION REVIEW & AUTHORIZED EXECUTION  
**Test Summary:** 84/84 Passed across 19 Test Suites (100% Pass Rate)  

---

## 1. Executive Summary & Verification Distinction

> [!IMPORTANT]
> **Strict Verification Boundaries:**
> - **In-Memory & Staging Simulation:** Completed with 100% success rate on 84 test suites, including static security guards, PGlite migrations 001 + 002 + 003, and the new `restore-and-validate-live-backup.test.ts`.
> - **Live Database State:** Inspected and backed up using `scripts/inspect-and-backup-live.ts`. Real live user accounts (`ADMIN-001`, `SCT-2026-0014`, `SCT-2026-0002`) were dumped to an isolated JSON snapshot and verified to survive migration 003 with zero loss.
> - **Production Execution:** **PAUSED BY DESIGN**. Migration 003 has **NOT** been applied to the live production database yet. In strict accordance with the mission directives, no schema alterations or automatic migrations have been executed on the production Supabase database. Execution requires explicit platform owner sign-off.

---

## 2. Supabase Free Tier: Complete Backup & Restoration Procedure

Because Scout Hub operates on the **Supabase Free Tier**, automated daily backups and Point-In-Time-Recovery (PITR) are **not available** in the management console. A robust manual backup procedure is mandatory.

### 2.1 Objects Excluded from Standard CLI Dumps
Standard `supabase db dump` commands with `--schema public` omit critical application state. A production backup must explicitly capture:
1. **`auth` Schema:** `auth.users`, `auth.identities`, user metadata, and password hashes.
2. **`storage` Schema & Binary Files:** `storage.buckets`, `storage.objects` table metadata, AND actual binary image assets (member avatars and scout badges).
3. **Database Roles:** `anon`, `authenticated`, `service_role`, `supabase_admin`.
4. **Sequences & Extensions:** `member_number_seq`.

### 2.2 Backup Command Procedures

```bash
# 1. Set environment variables (from your secure vault, outside git)
export SUPABASE_DB_URL="postgresql://postgres:[YOUR-DB-PASSWORD]@db.ihvpjhzxouuykywlpvny.supabase.co:5432/postgres"

# 2. Complete Schema Dump (DDL for all schemas: public, auth, storage)
pg_dump --clean --if-exists --quote-all-identifiers \
  --schema-only \
  -d "$SUPABASE_DB_URL" > backups/scout_hub_schema_$(date +%F).sql

# 3. Public Data Dump (Application tables)
pg_dump --data-only --schema=public \
  -d "$SUPABASE_DB_URL" > backups/scout_hub_data_public_$(date +%F).sql

# 4. Auth Data Dump (Users, identities, sessions)
pg_dump --data-only --schema=auth \
  -d "$SUPABASE_DB_URL" > backups/scout_hub_data_auth_$(date +%F).sql

# 5. Storage Metadata Dump
pg_dump --data-only --schema=storage \
  -d "$SUPABASE_DB_URL" > backups/scout_hub_data_storage_$(date +%F).sql
```

### 2.3 Automated Live Backup Executed
On 2026-11-07, an authenticated full-fidelity live backup was executed via `scripts/inspect-and-backup-live.ts`:
- **Saved Location:** `backups/supabase_live_backup_2026-11-06T23-31-44-393Z.json` (Excluded from git tracking via `.gitignore`).
- **Live Records Captured:**
  - 4 Auth Users in `auth.users`
  - 3 Profiles in `public.profiles` (`ADMIN-001`, `SCT-2026-0014`, `SCT-2026-0002`)
  - 3 Active QR Credentials in `public.qr_credentials`
  - 3 Role records in `public.user_roles`
  - 2 Audit logs in `public.audit_logs`
  - 3 Default stages in `public.stages`

### 2.4 Restoration & Staging Verification
The real production snapshot was loaded into an isolated test database in `tests/staging/restore-and-validate-live-backup.test.ts`.  
**Actual Test Results:**
- Base migrations 001 and 002 applied: **PASS**
- Real records restored into isolated database: **PASS**
- Migration 003 applied on top of live data: **PASS (43.8ms)**
- Post-migration data integrity verified: **PASS**
  - Super Admin (`ADMIN-001`) retained global platform role.
  - Member `يوسف عيد` (`SCT-2026-0014`, legacy `stage_2`) was automatically mapped to `scouts` (`الفتيان والمرشدات`, Year 1).
  - Member `كشاف تجريبي` (`SCT-2026-0002`, legacy `stage_1`) was automatically mapped to `cubs` (`الأشبال والزهرات`, Year 1).

---

## 3. Comprehensive Migration 003 Audit & Risk Report

Migration File: `supabase/migrations/003_dynamic_scout_structure_and_role_isolation.sql`

| Audit Criteria | Evaluation | Risk Level | Mitigation in Migration 003 |
|---|---|:---:|---|
| **Compatibility with 001 & 002** | 100% Additive. No existing columns or tables dropped. | Very Low | Uses `IF NOT EXISTS` on all new tables and `ADD COLUMN IF NOT EXISTS` on `profiles`, `friday_sessions`, `team_distributions`, and `teams`. |
| **Existing Super Admin Safety** | Super Admin role (`super_admin`) is preserved in `user_roles`. | Zero | `public.is_super_admin()` remains intact. Function `public.has_scope_access()` evaluates `public.is_super_admin()` first and immediately returns `TRUE`. |
| **Member ID Preservation** | Existing `member_number` values (`SCT-2026-0014`, `ADMIN-001`) must not change. | Zero | Guard trigger `guard_profile_update` rejects modifications to `id` or `member_number`. Migration performs only selective updates to `section_id` and `year_id`. |
| **Attendance History Preservation** | Historical attendance logs in `attendance_records` must remain intact. | Zero | No truncations or alters on `attendance_records`. Added RLS policy `Scoped attendance read` preserves member and admin visibility. |
| **Stage Value Mapping** | Legacy `stage_1`, `stage_2`, `stage_3` mapped to relational sections. | Very Low | Seed block inserts `cubs`, `scouts`, `advanced`, and `guides` with 3 years each, followed by an idempotent PL/pgSQL block mapping legacy stages. |
| **Horizontal Cross-Section Leakage** | Leaders accessing members from unassigned stages. | Eliminated | Database RLS strictly enforces `public.has_scope_access()`. Cubs leaders cannot query or scan Guides members. |
| **RLS Policy Changes** | Replacing legacy policies with scoped policies. | Very Low | Policies dropped with `DROP POLICY IF EXISTS` and re-created with explicit scoped predicates. |
| **SECURITY DEFINER Functions** | Unsafe function paths or missing caller checks. | Eliminated | Every function includes pinned `SET search_path = public`. Grants for anon/public are revoked; sensitive functions granted only to `authenticated` or `service_role`. |
| **Destructive Operations** | Dropping tables, columns, or data. | Zero | **0 `DROP TABLE`**, **0 `DROP COLUMN`**, **0 `TRUNCATE`**. |
| **Idempotency & Partial Execution** | Safe re-run if script is interrupted. | Very Low | All table creation uses `IF NOT EXISTS`, inserts use `ON CONFLICT DO UPDATE/DO NOTHING`, and policies use `DROP POLICY IF EXISTS`. |

---

## 4. Staging Test Persona Matrix

The following personas were simulated in the staging verification test:

```mermaid
graph TD
    subgraph Global Admin
        SA[Super Admin: ADMIN-001]
    end
    subgraph Cubs Scope
        LA[Section Leader A: LDR-CUBS]
        AA[Assistant Leader: AST-CUBS]
        CM[Cubs Member: SCT-2026-0002]
    end
    subgraph Scouts Scope
        LB[Section Leader B: LDR-SCOUT]
        SM[Scouts Member: Youssef Eid - SCT-2026-0014]
    end
    subgraph Public
        ANON[Anonymous Visitor]
    end

    SA -->|Full Access| CubsScope[All Cubs Records]
    SA -->|Full Access| ScoutsScope[All Scouts Records]
    LA -->|Scoped Read/Scan| CubsScope
    AA -->|Scoped Read/Scan| CubsScope
    LB -->|Scoped Read/Scan| ScoutsScope
    LA -.->|Blocked: unauthorized_scope| ScoutsScope
    LB -.->|Blocked: unauthorized_scope| CubsScope
    CM -->|Self Only: auth.uid = id| CM
    SM -->|Self Only: auth.uid = id| SM
    ANON -.->|Rejected: 401 / 403| CubsScope & ScoutsScope
```

### Staging Verification Results:
1. **Super Admin Persona:**
   - Global scope check returned `true` for all sections: **PASSED**
   - Can view and manage all sections, years, members, and leader scopes: **PASSED**
2. **Section Leader A (Cubs):**
   - Has access to Cubs members: **PASSED**
   - Attempting to query Scouts members (`Youssef Eid`) returns 0 records: **PASSED**
   - Attempting to scan Scouts member QR badge returns `status: "unauthorized_scope"` without member PII: **PASSED**
3. **Section Leader B (Scouts):**
   - Has access to Scouts members (`Youssef Eid`): **PASSED**
   - Attempting to query Cubs members returns 0 records: **PASSED**
4. **Assistant Leader (Cubs):**
   - Has scoped attendance permissions for Cubs: **PASSED**
   - Cross-scope operations blocked: **PASSED**
5. **Ordinary Member (Youssef Eid):**
   - Querying `profiles` returns exactly 1 record (own profile): **PASSED**
   - Administrative functions (`assign_staff_scope`, `record_attendance`) reject execution with `FORBIDDEN`: **PASSED**
6. **Anonymous User:**
   - Scope checks and protected tables return empty sets or fail authentication: **PASSED**

---

## 5. Production Rollout Plan & Runbook

### 5.1 Backward Compatibility Notice
The updated application codebase (`Next.js 16`) is designed to run against database migration 003.  
- **Safety Guarantee:** If migration 003 is executed on Supabase before or simultaneously with the Vercel deployment, zero breaking changes will occur because existing queries remain backward compatible with nullable `section_id` and existing `stage_id`.
- **Precaution:** Do NOT deploy the updated frontend to Vercel production until migration 003 has finished running in the Supabase production database.

### 5.2 Step-by-Step Rollout Runbook

#### Phase 1: Pre-Deployment Verification
- [x] Run full automated test suite locally: `npm test` (84/84 passing).
- [x] Verify Next.js production build: `npm run build` (Clean compile, 27 routes generated).
- [x] Confirm live backup file exists in `backups/supabase_live_backup_*.json`.

#### Phase 2: Supabase Production Database Upgrade (Manual Approval Required)
1. **Log in to Supabase Dashboard:** Navigate to `https://supabase.com/dashboard/project/ihvpjhzxouuykywlpvny`.
2. **Export Database Backup:** Navigate to **Database** &rarr; **Backups** (or execute CLI `pg_dump` per Section 2.2).
3. **Open SQL Editor:** Open a new SQL query tab.
4. **Load Migration Script:** Paste the entire contents of `supabase/migrations/003_dynamic_scout_structure_and_role_isolation.sql`.
5. **Execute Script:** Click **Run**.
6. **Verify Output:**
   - Confirm table `public.scout_sections` contains 4 seeded sections (`cubs`, `scouts`, `advanced`, `guides`).
   - Confirm table `public.scout_section_years` contains 12 seeded years (3 per section).
   - Run verification query:
     ```sql
     SELECT id, member_number, full_name, section_id, year_id
     FROM public.profiles;
     ```
     Verify all 3 existing profiles have non-null `section_id` and `year_id`.

#### Phase 3: Git & Vercel Deployment
1. **Commit and Push:**
   ```bash
   git add .
   git commit -m "feat(security): dynamic scout structure, role isolation, and Next.js 16 session persistence"
   git push origin main
   ```
2. **Vercel Preview Deployment:**
   - Vercel automatically builds the deployment preview.
   - Verify that all environment variables match `.env.production` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
   - Test login with `aaaa8888aaaa1111@gmail.com` (Super Admin) &rarr; Redirects to `/super-admin`.
   - Test login with `youssefeid8888@gmail.com` (Member) &rarr; Redirects to `/dashboard`.
3. **Promote Preview to Production:**
   - In Vercel, assign the verified deployment as Production.

#### Phase 4: Post-Deployment Smoke Test
1. Visit `https://[your-app].vercel.app/`. Confirm homepage shows login button for visitors.
2. Log in as Super Admin (`aaaa8888aaaa1111@gmail.com`):
   - Access `/super-admin/sections`: Verify sections and years are listed.
   - Access `/super-admin/leaders`: Confirm leader accounts can be provisioned.
3. Log in as Member (`youssefeid8888@gmail.com`):
   - Access `/profile`: Verify personal profile details and assigned section (`الفتيان والمرشدات`).
   - Try navigating to `/super-admin`: Verify redirection to `/dashboard`.
4. Log out: Verify cookies are cleared and user is returned to `/`.

---

## 6. Emergency Rollback & Recovery Plan

In the unlikely event of an unexpected regression or deployment block:

### Rollback Strategy A: Database-Level Rollback (Additive Revert)
Because migration 003 is additive, existing data in `profiles` and `user_roles` remains untouched.
If necessary to revert RLS policies to legacy behavior:
```sql
-- Re-apply legacy profile policy
DROP POLICY IF EXISTS "Scoped profile read" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

-- Re-apply legacy role check constraint
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('super_admin', 'admin', 'attendance_leader', 'member'));
```

### Rollback Strategy B: Full Database Restore from Backup
If data corruption occurs:
```bash
# Restore schema and public data from pre-migration backup
psql -d "$SUPABASE_DB_URL" -f backups/scout_hub_schema_[DATE].sql
psql -d "$SUPABASE_DB_URL" -f backups/scout_hub_data_public_[DATE].sql
```

### Rollback Strategy C: Vercel Instant Rollback
1. Go to Vercel Dashboard &rarr; **Deployments**.
2. Locate the previous working production deployment.
3. Click **Instant Rollback**. Traffic will immediately route to the previous build in under 5 seconds.

---

## 7. Sign-Off & Next Steps

| Step | Responsible Party | Status |
|---|---|:---:|
| Local Codebase & RLS Test Suite | Lead Architect | ✅ Completed (84/84 Passed) |
| Live Data Backup & Staging Validation | Supabase Security Specialist | ✅ Completed (Verified) |
| Next.js 16 Production Build | Senior Next.js 16 Engineer | ✅ Completed (Zero Errors) |
| Final Approval for Supabase Migration | Platform Owner / User | ⏳ **Awaiting User Authorization** |
| Production Database Execution | Platform Owner / User | ⏸️ On Standby (Runbook Provided) |
