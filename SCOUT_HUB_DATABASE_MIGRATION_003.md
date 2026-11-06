# SCOUT HUB — DATABASE MIGRATION 003 SPECIFICATION & UPGRADE PLAN

**Migration File:** `supabase/migrations/003_dynamic_scout_structure_and_role_isolation.sql`  
**Target Schema:** Supabase PostgreSQL 15+  
**Nature:** 100% Additive & Backward-Compatible (No Destructive Dropping of Tables)  
**Verification:** Verified via PGlite unit tests and Next.js 16 build  

---

## 1. Schema Additions & Structure

### 1.1 New Tables Created

#### `public.scout_sections`
Stores dynamic scout sections (e.g., الأشبال, الكشافة, المتقدم, الجوالة, المرشدات, الزهرات).
```sql
CREATE TABLE IF NOT EXISTS public.scout_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT DEFAULT 'Layers',
  color_theme TEXT DEFAULT '#1B4332',
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
```

#### `public.scout_section_years`
Stores dynamic years/stages within each section (e.g., السنة الأولى, السنة الثانية, etc.).
```sql
CREATE TABLE IF NOT EXISTS public.scout_section_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES public.scout_sections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT scout_section_years_section_code_unique UNIQUE (section_id, code)
);
```

#### `public.staff_scope_assignments`
Maps staff leaders to sections and optional years.
```sql
CREATE TABLE IF NOT EXISTS public.staff_scope_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES public.scout_sections(id) ON DELETE CASCADE,
  year_id UUID REFERENCES public.scout_section_years(id) ON DELETE SET NULL,
  permissions TEXT[] NOT NULL DEFAULT ARRAY['attendance', 'members_read', 'teams_manage']::TEXT[],
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT staff_scope_assignments_user_scope_unique UNIQUE NULLS NOT DISTINCT (user_id, section_id, year_id)
);
```

---

## 2. Table Enhancements & Foreign Keys

Additive columns were added to existing tables without breaking legacy code:
- **`public.profiles`**: Added `section_id UUID REFERENCES public.scout_sections(id)` and `year_id UUID REFERENCES public.scout_section_years(id)`.
- **`public.friday_sessions`**: Added `section_id UUID REFERENCES public.scout_sections(id)` and `year_id UUID REFERENCES public.scout_section_years(id)`.
- **`public.team_distributions`**: Added `section_id UUID REFERENCES public.scout_sections(id)` and `year_id UUID REFERENCES public.scout_section_years(id)`.
- **`public.teams`**: Added `section_id UUID REFERENCES public.scout_sections(id)` and `year_id UUID REFERENCES public.scout_section_years(id)`.

---

## 3. Security Helper Functions

All security helper functions are declared with explicit schemas and pinned `SET search_path = public`:

### 3.1 `public.is_staff(check_user_id UUID)`
```sql
CREATE OR REPLACE FUNCTION public.is_staff(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = check_user_id
      AND ur.role IN ('super_admin', 'admin', 'section_leader', 'assistant_leader', 'attendance_leader')
  );
$$;
```

### 3.2 `public.has_scope_access(check_user_id UUID, target_section_id UUID, target_year_id UUID)`
Authoritative scope check. If `check_user_id` is a `super_admin` or `admin`, returns `TRUE` globally. Otherwise checks active records in `staff_scope_assignments`.

---

## 4. RLS Policy Overhaul

### 4.1 Profiles Scoped Read Policy
```sql
DROP POLICY IF EXISTS profiles_select_scoped ON public.profiles;
CREATE POLICY profiles_select_scoped ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.is_super_admin(auth.uid())
    OR public.is_admin(auth.uid())
    OR public.has_scope_access(auth.uid(), profiles.section_id, profiles.year_id)
  );
```

### 4.2 QR Attendance Scope Guard
Updated `verify_qr_credential` and `record_attendance`:
- Before accepting a QR scan or writing attendance, checks `public.has_scope_access(scanner_uid, member.section_id, member.year_id)`.
- If false, rejects with `status = 'unauthorized_scope'` or error `UNAUTHORIZED_SCOPE: Leader cannot take attendance for members outside their assigned section/year`.

---

## 5. Backward Compatibility & Backfill

Migration 003 automatically seeds default sections matching existing stage names:
- `الأشبال` (`code: 'cubs'`)
- `الكشافة` (`code: 'scouts'`)
- `المرشدات` (`code: 'guides'`)
- `الجوالة` (`code: 'rovers'`)

Each is pre-populated with 3 initial years (`السنة الأولى`, `السنة الثانية`, `السنة الثالثة`).

Existing profiles with `stage_id` values (e.g. `stage_1`, `stage_2`, `stage_3`) are automatically mapped to corresponding `section_id` values without data loss.

---

## 6. Deployment Procedure

> [!IMPORTANT]
> **Production Deployment Steps:**
> 1. Export a manual database backup from the Supabase Dashboard: **Database -> Backups -> Create Backup**.
> 2. Open the Supabase SQL Editor.
> 3. Paste the contents of `supabase/migrations/003_dynamic_scout_structure_and_role_isolation.sql`.
> 4. Run the query. Ensure zero syntax errors or transaction rollbacks.
> 5. Verify the seeded sections appear in `public.scout_sections`.
> 6. Assign the Super Admin account the initial scopes or test with `SUPER_ADMIN` credentials.
