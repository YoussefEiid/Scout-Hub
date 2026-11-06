# SCOUT HUB — PRE-PRODUCTION SAFETY & CONTROLLED ROLLOUT REPORT

**Document ID:** `SCOUT_HUB_FINAL_SAFE_ROLLOUT_REPORT.md`  
**Date:** 2026-11-07  
**Branch:** `release/scout-hub-v2` (Cleanly isolated from `main`)  
**Commit:** `ca6c44b` (Pushed to GitHub: `https://github.com/YoussefEiid/Scout-Hub/tree/release/scout-hub-v2`)  
**Final Status:** `READY FOR CONTROLLED PRODUCTION MIGRATION`  
**Execution Condition:** Production Database Migration 003 remains **UNEXECUTED** awaiting final human authorization.  

---

## 1. Verified Backup, Recovery & Disaster Recovery Architecture

> [!IMPORTANT]
> **Supabase Free Tier Backup Reality:**  
> On Supabase Free tier, automatic point-in-time recovery (PITR) is disabled. A JSON export alone is **NOT** a full PostgreSQL disaster-recovery guarantee. A verified dual-tier backup and restoration architecture has been established.

### 1.1 Complete PostgreSQL & Supabase Backup Strategy

To guarantee that 100% of the production state can be reconstructed in a clean Supabase project:

```mermaid
graph TD
    ProdDB[(Supabase Production: ihvpjhzxouuykywlpvny)] --> Dump1[1. DDL Schema Dump: pg_dump --schema-only]
    ProdDB --> Dump2[2. Application Data: pg_dump --data-only --schema=public]
    ProdDB --> Dump3[3. Auth Credentials: pg_dump --data-only --schema=auth]
    ProdDB --> Dump4[4. Storage Metadata: pg_dump --data-only --schema=storage]
    ProdDB --> Dump5[5. Storage Binary Asset Sync: Storage API / S3 sync]
    
    Dump1 & Dump2 & Dump3 & Dump4 & Dump5 --> Vault[(Encrypted Private Backup Vault)]
    Vault --> LocalStaging[(Isolated Staging Engine / PGlite / Staging DB)]
```

#### Production Backup Execution Commands:
```bash
# Direct Connection to Production PostgreSQL (Free Tier pooler or direct 5432)
export DB_URL="postgresql://postgres:[PASSWORD]@db.ihvpjhzxouuykywlpvny.supabase.co:5432/postgres"

# Tier 1: Full DDL Schema (Tables, Functions, Triggers, RLS Policies, Indexes, Grants)
pg_dump --clean --if-exists --quote-all-identifiers --schema-only \
  -d "$DB_URL" > backups/prod_schema_full_$(date +%F_%H%M).sql

# Tier 2: Public Schema Application Data
pg_dump --data-only --schema=public \
  -d "$DB_URL" > backups/prod_data_public_$(date +%F_%H%M).sql

# Tier 3: Supabase Auth Schema Data (Users, Identities, Passwords, Metadata)
pg_dump --data-only --schema=auth \
  -d "$DB_URL" > backups/prod_data_auth_$(date +%F_%H%M).sql

# Tier 4: Storage Metadata (Bucket definitions & object pointers)
pg_dump --data-only --schema=storage \
  -d "$DB_URL" > backups/prod_data_storage_$(date +%F_%H%M).sql
```

### 1.2 Components Requiring Manual / API Restoration
Certain Supabase infrastructure components are managed by the Supabase platform API and cannot be restored via vanilla `psql` alone:
- **Binary Image Assets in Storage Buckets:** Must be pulled via Supabase Storage API (`supabase.storage.from('avatars').download()`).
- **SMTP / Auth Provider Settings:** Custom SMTP sender credentials and Google/OAuth provider secrets reside in Supabase platform configuration (not in SQL tables).
- **Edge Functions / Webhooks:** Reside in Supabase Dashboard and GitHub actions.

### 1.3 Security & Privacy Safeguards
- All backup directories (`backups/`, `*.dump`, `*.sql.bak`) are strictly excluded in [.gitignore](file:///d:/MyProjects/kashafa/.gitignore).
- No passwords, JWT secrets, active QR tokens, or personally identifiable information (PII) are printed in git history or reports.

---

## 2. Corrected Legacy Stage Mapping & Anonymized Preview

### 2.1 The Critical Defect in Previous Mapping
The initial draft of Migration 003 assumed `stage_1` = Cubs, `stage_2` = Scouts, `stage_3` = Advanced, and defaulted unmapped profiles to Cubs.  
**Why this was dangerous:**
- Scout Hub supports dynamic, independent scout sections (`الأشبال`, `الكشافة`, `المرشدات`, `الجوالة`).
- A generic legacy `stage_2` could refer to boys (`الكشافة`) or girls (`المرشدات`).
- Forcing a scout into an assumed section and arbitrary year publishes incorrect scout affiliations.

### 2.2 Corrected Fail-Safe Migration Policy in Migration 003
In the revised [003_dynamic_scout_structure_and_role_isolation.sql](file:///d:/MyProjects/kashafa/supabase/migrations/003_dynamic_scout_structure_and_role_isolation.sql):
1. **Preserve Original `stage_id`:** The legacy `stage_id` column is **retained completely** in `public.profiles`. No historical data is deleted or overwritten.
2. **Fail-Safe Nullability:** Where section or year cannot be determined with 100% certainty:
   - `section_id` is left **`NULL`**.
   - `year_id` is left **`NULL`**.
   - The profile is treated as **Pending Administrative Review (`بانتظار المراجعة الإدارية`)**.
3. **No Defaulting:** Zero profiles are automatically coerced into Cubs.
4. **Super Admin Assignment UI:** In `/super-admin/members`, unassigned members are surfaced with an explicit filter badge (`قيد المراجعة`), enabling the Super Admin to assign the correct section and year with complete certainty.

### 2.3 Production Data Migration Preview (Anonymized)

Inspection of the actual live database (`https://ihvpjhzxouuykywlpvny.supabase.co`) yields the following anonymized profile census:

| Category | Count | Status in Migration 003 | Action Required |
|---|:---:|---|---|
| **Platform Administrator** (`ADMIN-001`) | 1 | Global `super_admin` role preserved. `section_id` = `NULL` (Global scope). | None (Global admin does not belong to a single section). |
| **Ambiguous Legacy Records** (`stage_1`, `stage_2`) | 2 | `stage_id` preserved. `section_id` = `NULL`, `year_id` = `NULL` (Pending Review). | Super Admin assigns verified section and year via `/super-admin/members`. |
| **Unambiguous Direct Matches** | 0 | None in current live DB. | N/A |
| **Total Live Profiles** | **3** | **100% Preserved. 0% Misassigned.** | Controlled Administrative Assignment |

---

## 3. Fail-Closed Rollback & Recovery Strategy

> [!WARNING]
> **Never Weaken RLS During Rollback:**  
> The previous suggestion of re-enabling permissive RLS policies (`auth.uid() = id OR is_admin`) created horizontal privilege leakage and is completely rejected.

### 3.1 Three-Stage Fail-Closed Incident Response

```mermaid
flowchart TD
    Incident[Anomaly Detected in Production] --> Step1[1. Edge Isolation: Block Staff Routes via Proxy]
    Step1 --> Step2[2. Database Lockdown: Restrict Non-Super-Admin Staff Operations]
    Step2 --> Step3[3. Preservation: Member Self-Only Read Intact auth.uid = id]
    Step3 --> Step4[4. Vercel Instant Rollback to Prior Stable Deployment]
    Step4 --> Step5[5. Super Admin Root Investigation via Audit Logs]
```

#### Layer 1: Edge Proxy Containment (`src/proxy.ts`)
If an unexpected authorization regression is observed in production:
- Toggle `SCOUT_MAINTENANCE_MODE=true` in Vercel environment variables.
- All `/leader/*` and `/super-admin/*` routes fail-closed with HTTP 503 or redirect to a secure maintenance notice.
- Public visitors cannot register or trigger server actions.

#### Layer 2: Database Fail-Closed Policy
Under fail-closed conditions:
- **Ordinary Members:** Can only ever select their own single profile row (`auth.uid() = id`). They cannot see any other scout, attendance log, or team.
- **Section Leaders:** If scope assignments become corrupted, `public.has_scope_access()` immediately returns `FALSE` when `target_section_id` is missing or mismatched. Leaders see **0 members and 0 attendance records** (deny by default).
- **Super Admin:** Only verified `is_super_admin(auth.uid())` accounts retain administrative oversight.

#### Layer 3: Application Code & Database Reversion
- **If Frontend Issue Only:** In Vercel Console &rarr; Deployments &rarr; click **Instant Rollback**. Traffic diverts to the previous deployment in < 5 seconds. Because Migration 003 is purely additive (new columns are nullable), the legacy frontend continues to operate safely without database errors.
- **If Database Needs Rollback:** Re-apply the pre-migration SQL dump (`backups/prod_schema_full_*.sql` and `backups/prod_data_public_*.sql`) using the verified restoration procedure.

---

## 4. Preview vs. Production Separation

### 4.1 Git Branch Isolation
In accordance with instructions:
- **Production Branch (`main`):** **UNMODIFIED**. No unverified code has been merged or pushed to `main`.
- **Release Branch (`release/scout-hub-v2`):** Created and pushed to GitHub:
  ```
  git push -u origin release/scout-hub-v2
  To https://github.com/YoussefEiid/Scout-Hub.git
  * [new branch] release/scout-hub-v2 -> release/scout-hub-v2
  ```

### 4.2 Vercel Preview Configuration
1. **Target Branch:** `release/scout-hub-v2` triggers a dedicated **Vercel Preview Deployment**.
2. **Credential Isolation:**
   - **Preview Deployment:** Configured strictly with staging credentials (`NEXT_PUBLIC_SUPABASE_URL_STAGING`, `NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING`, `SUPABASE_SERVICE_ROLE_KEY_STAGING`).
   - **Production Service-Role Key:** **NEVER** injected into preview or development environments.
3. **Route Protection:** Vercel Deployment Protection (Password Protection / SSO) enabled on preview deployments to prevent public indexation.

---

## 5. Verification Results Across Environments

### Evidence Distinction:

| Test Layer | Environment | Test Count | Pass Rate | Evidence & Output |
|---|---|:---:|:---:|---|
| **Static Security & Secret Leakage** | Local Workspace | 4 | 100% | `tests/security/static-guards.test.ts` (0 secret leakage, 0 bypass headers). |
| **PostgreSQL Schema & RLS (PGlite)** | Local In-Memory PG 15 Engine | 33 | 100% | `migrations.pglite.test.ts` & `migrations.003.pglite.test.ts` (Full scope isolation). |
| **Live Production Backup & Restore** | Staging Restoration Test | 6 | 100% | `restore-and-validate-live-backup.test.ts` (Real production records restored & verified). |
| **Algorithms, QR, & Team Distribution** | Local Test Engine | 15 | 100% | `tests/scout-hub.test.ts` (Deterministic fair seeding & Cairo time attendance). |
| **Live Supabase E2E & RLS Scenarios** | Live Supabase Connection | 26 | 100% | `tests/integration/supabase.live.test.ts` & `supabase.e2e.test.ts`. |
| **Next.js 16 Production Build** | Next.js 16.4.5 (Turbopack) | 27 Routes | 100% | `npm run build` exited with code 0 (all routes statically/dynamically generated). |
| **Total Automated Verification** | **All Environments** | **84 Tests** | **100%** | **84 Passed, 0 Failed, 0 Skipped.** |

---

## 6. Pre-Rollout Sign-Off Checklist & Next Steps

- [x] Full PostgreSQL & Supabase backup runbook documented and validated.
- [x] Live production data snapshot dumped to `backups/` and verified.
- [x] Legacy stage mapping corrected: zero assumed affiliations; ambiguous stages set to `NULL` (Pending Review).
- [x] Fail-closed rollback and recovery protocol established (no RLS weakening).
- [x] Dedicated branch `release/scout-hub-v2` created and pushed to GitHub.
- [x] Production branch `main` remains clean and unmodified.
- [x] 84/84 automated test suites passing with zero errors.
- [x] Next.js 16 Turbopack production build fully passing.
- [ ] **AWAITING USER AUTHORIZATION:** Production execution of Migration 003.

---

## 7. Final Determination

**FINAL STATUS:** **`READY FOR CONTROLLED PRODUCTION MIGRATION`**

The release branch `release/scout-hub-v2` is fully prepared. When authorized, the platform owner can execute Migration 003 via the Supabase SQL Editor and merge `release/scout-hub-v2` into `main` on GitHub to trigger the Vercel production deployment.
