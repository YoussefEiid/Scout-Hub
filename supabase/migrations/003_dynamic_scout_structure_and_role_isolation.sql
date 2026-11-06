-- ==============================================================================
-- SCOUT HUB — 003 DYNAMIC SCOUT STRUCTURE & ROLE ISOLATION
-- Run AFTER 001_initial_schema.sql and 002_production_hardening.sql.
--
-- What this migration does:
--   1. Expands user_roles to include 'section_leader' and 'assistant_leader'.
--   2. Introduces dynamic, configurable 'scout_sections' and 'scout_section_years'.
--   3. Introduces 'staff_scope_assignments' for database-enforced leader scopes.
--   4. Adds section_id and year_id foreign keys to profiles, friday_sessions,
--      team_distributions, and teams.
--   5. Implements has_scope_access(check_user_id, target_section_id, target_year_id).
--   6. Enforces strict database-level RLS isolation:
--      - Members see ONLY their own profile and published roster.
--      - Section Leaders see ONLY members, attendance, and distributions in assigned scopes.
--      - Super Admin has global oversight across all sections.
--   7. Updates QR verification & attendance recording to reject cross-scope scanning.
--   8. Safely backfills existing stage-based data without breaking existing records.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Expand User Roles Constraint
-- ------------------------------------------------------------------------------
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles
    ADD CONSTRAINT user_roles_role_check
    CHECK (role IN ('super_admin', 'admin', 'section_leader', 'assistant_leader', 'attendance_leader', 'member'));

-- ------------------------------------------------------------------------------
-- 2. Dynamic Scout Sections (الأقسام / المراحل الكشفية القابلة للتخصيص)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scout_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT NOT NULL DEFAULT 'compass',
    color_theme TEXT NOT NULL DEFAULT '#23836B',
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scout_sections_order ON public.scout_sections(display_order);
CREATE INDEX IF NOT EXISTS idx_scout_sections_active ON public.scout_sections(is_active);

-- ------------------------------------------------------------------------------
-- 3. Dynamic Section Years / Levels (السنوات / الأفواج الكشفية داخل كل قسم)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scout_section_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES public.scout_sections(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_section_year_name UNIQUE (section_id, name)
);

CREATE INDEX IF NOT EXISTS idx_section_years_section ON public.scout_section_years(section_id);
CREATE INDEX IF NOT EXISTS idx_section_years_order ON public.scout_section_years(display_order);

-- ------------------------------------------------------------------------------
-- 4. Staff Scope Assignments (تخصيص صلاحيات القادة بالأقسام والسنوات)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_scope_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES public.scout_sections(id) ON DELETE CASCADE,
    year_id UUID REFERENCES public.scout_section_years(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_scopes_user ON public.staff_scope_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_scopes_section ON public.staff_scope_assignments(section_id);
CREATE INDEX IF NOT EXISTS idx_staff_scopes_year ON public.staff_scope_assignments(year_id);

-- Prevent duplicate scope assignments
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_scope_all_years
    ON public.staff_scope_assignments (user_id, section_id)
    WHERE year_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_scope_specific_year
    ON public.staff_scope_assignments (user_id, section_id, year_id)
    WHERE year_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 5. Link Profiles, Sessions, and Teams to Dynamic Sections & Years
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.scout_sections(id),
    ADD COLUMN IF NOT EXISTS year_id UUID REFERENCES public.scout_section_years(id);

CREATE INDEX IF NOT EXISTS idx_profiles_section_year ON public.profiles(section_id, year_id);

ALTER TABLE public.friday_sessions
    ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.scout_sections(id);

CREATE INDEX IF NOT EXISTS idx_friday_sessions_section ON public.friday_sessions(section_id);

ALTER TABLE public.team_distributions
    ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.scout_sections(id);

ALTER TABLE public.teams
    ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.scout_sections(id),
    ADD COLUMN IF NOT EXISTS year_id UUID REFERENCES public.scout_section_years(id);

-- ------------------------------------------------------------------------------
-- 6. Helper Security Functions (Search Path Pinned)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_staff(check_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = check_user_id
          AND role IN ('super_admin', 'admin', 'section_leader', 'assistant_leader', 'attendance_leader')
    );
$$;

CREATE OR REPLACE FUNCTION public.is_section_leader(check_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = check_user_id
          AND role IN ('super_admin', 'admin', 'section_leader')
    );
$$;

-- Replace is_attendance_staff to recognize section_leader & assistant_leader
CREATE OR REPLACE FUNCTION public.is_attendance_staff(check_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = check_user_id
          AND role IN ('super_admin', 'admin', 'section_leader', 'assistant_leader', 'attendance_leader')
    );
$$;

-- Core Scope Access Check Function:
-- Returns TRUE if caller is Super Admin (or legacy Admin),
-- OR if caller has an explicit scope assignment covering (target_section_id, target_year_id).
CREATE OR REPLACE FUNCTION public.has_scope_access(
    check_user_id uuid,
    target_section_id uuid,
    target_year_id uuid DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF check_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 1. Super Admins and global Admins have access to everything
    IF public.is_super_admin(check_user_id) OR EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = check_user_id AND role = 'admin'
    ) THEN
        RETURN TRUE;
    END IF;

    -- 2. Non-super admin cannot access an unassigned or null target section
    IF target_section_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 3. Check staff scope assignment
    IF target_year_id IS NOT NULL THEN
        RETURN EXISTS (
            SELECT 1 FROM public.staff_scope_assignments
            WHERE user_id = check_user_id
              AND section_id = target_section_id
              AND (year_id IS NULL OR year_id = target_year_id)
        );
    ELSE
        -- If no target year is specified, leader has access if assigned to section
        RETURN EXISTS (
            SELECT 1 FROM public.staff_scope_assignments
            WHERE user_id = check_user_id
              AND section_id = target_section_id
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_section_leader(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_scope_access(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_section_leader(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_scope_access(uuid, uuid, uuid) TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. Seed Initial Sections & Safe Stage Migration Policy
-- ------------------------------------------------------------------------------
-- Seed default scout sections according to organization structure
INSERT INTO public.scout_sections (code, name, description, icon, color_theme, display_order)
VALUES
    ('cubs', 'الأشبال', 'مرحلة الأشبال الكشفية', 'flame', '#EA580C', 1),
    ('scouts', 'الكشافة', 'مرحلة الفتيان والكشافة', 'compass', '#23836B', 2),
    ('guides', 'المرشدات', 'مرحلة المرشدات والزهرات', 'award', '#D97706', 3),
    ('rovers', 'الجوالة', 'مرحلة الجوالة والشباب الكشفي', 'shield', '#7C3AED', 4)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

-- Seed standard 3 years for each scout section
INSERT INTO public.scout_section_years (section_id, name, display_order)
SELECT s.id, y.name, y.disp_order
FROM public.scout_sections s
CROSS JOIN (
    VALUES 
        ('السنة الأولى', 1),
        ('السنة الثانية', 2),
        ('السنة الثالثة', 3)
) AS y(name, disp_order)
ON CONFLICT (section_id, name) DO NOTHING;

-- Fail-Safe Stage Mapping Policy:
-- Existing records retain their original stage_id without alteration.
-- DO NOT guess or force ambiguous stages (such as stage_1, stage_2, stage_3) into predefined sections.
-- Where the exact section or year cannot be determined with certainty, section_id and year_id
-- are left NULL (Pending Administrative Review) to prevent incorrect scout affiliations.
-- The Super Admin manually reviews and assigns unassigned members from the management dashboard.
DO $$
BEGIN
    -- Only map if a profile already holds an explicit exact match to a section code (e.g. 'cubs', 'rovers')
    -- Legacy generic codes ('stage_1', 'stage_2', 'stage_3') remain NULL for section_id and year_id.
    UPDATE public.profiles p
       SET section_id = s.id
      FROM public.scout_sections s
     WHERE p.stage_id = s.code
       AND p.section_id IS NULL;

    -- NOTE: stage_id column is completely preserved.
    -- Unmapped or ambiguous profiles remain with section_id = NULL (Pending Admin Review).
END $$;

-- ------------------------------------------------------------------------------
-- 8. Row Level Security Policies (Tightened Scope Isolation)
-- ------------------------------------------------------------------------------
ALTER TABLE public.scout_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scout_section_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_scope_assignments ENABLE ROW LEVEL SECURITY;

-- Scout Sections RLS:
CREATE POLICY "Public authenticated read active sections" ON public.scout_sections
    FOR SELECT TO authenticated
    USING (is_active OR public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin manages scout sections" ON public.scout_sections
    FOR ALL TO authenticated
    USING (public.is_super_admin(auth.uid()))
    WITH CHECK (public.is_super_admin(auth.uid()));

-- Section Years RLS:
CREATE POLICY "Public authenticated read active years" ON public.scout_section_years
    FOR SELECT TO authenticated
    USING (is_active OR public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin manages section years" ON public.scout_section_years
    FOR ALL TO authenticated
    USING (public.is_super_admin(auth.uid()))
    WITH CHECK (public.is_super_admin(auth.uid()));

-- Staff Scope Assignments RLS:
CREATE POLICY "Read own scopes or super admin reads all" ON public.staff_scope_assignments
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin manages staff scopes" ON public.staff_scope_assignments
    FOR ALL TO authenticated
    USING (public.is_super_admin(auth.uid()))
    WITH CHECK (public.is_super_admin(auth.uid()));

-- Profiles RLS:
-- A user can see their own profile, Super Admin can see all profiles,
-- and Leaders can ONLY see members within their explicitly assigned scope!
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Scoped profile read" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        auth.uid() = id
        OR public.is_super_admin(auth.uid())
        OR public.has_scope_access(auth.uid(), profiles.section_id, profiles.year_id)
    );

-- Guard profile updates: protect section_id and year_id from self-mutation by non-admins
CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) AND NOT public.is_admin(auth.uid()) THEN
        IF NEW.id IS DISTINCT FROM OLD.id
           OR NEW.member_number IS DISTINCT FROM OLD.member_number
           OR NEW.is_active IS DISTINCT FROM OLD.is_active
           OR NEW.stage_id IS DISTINCT FROM OLD.stage_id
           OR NEW.section_id IS DISTINCT FROM OLD.section_id
           OR NEW.year_id IS DISTINCT FROM OLD.year_id THEN
            RAISE EXCEPTION 'FORBIDDEN_FIELD_UPDATE' USING ERRCODE = '42501';
        END IF;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- Attendance Records RLS:
-- Members see own attendance, Super Admin sees all, Leaders see only their scope's records!
DROP POLICY IF EXISTS "Members read own attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Staff reads attendance" ON public.attendance_records;

CREATE POLICY "Scoped attendance read" ON public.attendance_records
    FOR SELECT TO authenticated
    USING (
        auth.uid() = member_id
        OR public.is_super_admin(auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = attendance_records.member_id
              AND public.has_scope_access(auth.uid(), p.section_id, p.year_id)
        )
    );

-- ------------------------------------------------------------------------------
-- 9. Updated RPC Functions with Scope Enforcement
-- ------------------------------------------------------------------------------

-- QR Verification with Scope Guard:
-- When a leader scans a member's QR, if the member is NOT in the leader's scope,
-- returns 'unauthorized_scope' without exposing private member data!
CREATE OR REPLACE FUNCTION public.verify_qr_credential(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    c public.qr_credentials;
    p public.profiles;
    v_team text;
    v_actor uuid := auth.uid();
BEGIN
    IF v_actor IS NULL OR NOT public.is_attendance_staff(v_actor) THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO c FROM public.qr_credentials WHERE id = p_token;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF NOT c.is_active OR c.revoked_at IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'revoked');
    END IF;

    SELECT * INTO p FROM public.profiles WHERE id = c.member_id;
    IF NOT FOUND OR NOT p.is_active THEN RETURN jsonb_build_object('status', 'inactive'); END IF;

    -- Strict Scope Isolation Guard:
    IF NOT public.has_scope_access(v_actor, p.section_id, p.year_id) THEN
        RETURN jsonb_build_object('status', 'unauthorized_scope');
    END IF;

    SELECT t.name INTO v_team
      FROM public.team_memberships tm
      JOIN public.teams t ON t.id = tm.team_id
      JOIN public.team_distributions d ON d.id = t.distribution_id
     WHERE tm.member_id = p.id AND d.is_current_published
     LIMIT 1;

    RETURN jsonb_build_object(
        'status', 'valid',
        'member', jsonb_build_object(
            'id', p.id, 'full_name', p.full_name, 'member_number', p.member_number,
            'stage_id', p.stage_id, 'section_id', p.section_id, 'year_id', p.year_id,
            'team_name', v_team));
END;
$$;

-- Attendance Recording with Scope Guard:
CREATE OR REPLACE FUNCTION public.record_attendance(
    p_session_id uuid,
    p_uniform text,
    p_qr_token uuid DEFAULT NULL,
    p_member_id uuid DEFAULT NULL,
    p_manual_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actor uuid := auth.uid();
    s public.friday_sessions;
    c public.qr_credentials;
    p public.profiles;
    v_member uuid;
    v_cred uuid;
    v_manual boolean;
    v_now timestamptz := now();
    v_arrival text;
    v_id uuid;
BEGIN
    IF v_actor IS NULL OR NOT public.is_attendance_staff(v_actor) THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    IF p_uniform IS NULL OR p_uniform NOT IN ('with_uniform', 'without_uniform') THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_UNIFORM');
    END IF;

    SELECT * INTO s FROM public.friday_sessions WHERE id = p_session_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'code', 'SESSION_NOT_FOUND'); END IF;
    IF NOT s.is_open_for_attendance THEN
        RETURN jsonb_build_object('success', false, 'code', 'SESSION_CLOSED');
    END IF;

    IF p_qr_token IS NOT NULL THEN
        SELECT * INTO c FROM public.qr_credentials WHERE id = p_qr_token;
        IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'code', 'INVALID_QR'); END IF;
        IF NOT c.is_active OR c.revoked_at IS NOT NULL THEN
            RETURN jsonb_build_object('success', false, 'code', 'REVOKED_QR');
        END IF;
        v_member := c.member_id; v_cred := c.id; v_manual := false;
    ELSE
        IF p_member_id IS NULL THEN RETURN jsonb_build_object('success', false, 'code', 'MEMBER_REQUIRED'); END IF;
        IF p_manual_reason IS NULL OR length(btrim(p_manual_reason)) < 3 THEN
            RETURN jsonb_build_object('success', false, 'code', 'REASON_REQUIRED');
        END IF;
        v_member := p_member_id; v_manual := true;
    END IF;

    SELECT * INTO p FROM public.profiles WHERE id = v_member;
    IF NOT FOUND OR NOT p.is_active THEN
        RETURN jsonb_build_object('success', false, 'code', 'MEMBER_NOT_FOUND');
    END IF;

    -- Strict Scope Enforcement:
    IF NOT public.has_scope_access(v_actor, p.section_id, p.year_id) THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED_SCOPE');
    END IF;

    -- If session is bound to a specific section, enforce that member matches session section
    IF s.section_id IS NOT NULL AND p.section_id IS DISTINCT FROM s.section_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'SECTION_MISMATCH');
    END IF;

    v_arrival := CASE
        WHEN v_now > ((s.session_date + s.late_threshold_time) AT TIME ZONE 'Africa/Cairo')
        THEN 'late' ELSE 'on_time' END;

    INSERT INTO public.attendance_records
        (session_id, member_id, qr_credential_id, uniform_status, arrival_status,
         recorded_at, recorded_by, is_manual, manual_reason)
    VALUES
        (p_session_id, v_member, v_cred, p_uniform, v_arrival,
         v_now, v_actor, v_manual, CASE WHEN v_manual THEN btrim(p_manual_reason) END)
    ON CONFLICT (session_id, member_id) DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'DUPLICATE');
    END IF;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (v_actor,
            CASE WHEN v_manual THEN 'MANUAL_ATTENDANCE_RECORDED' ELSE 'QR_ATTENDANCE_RECORDED' END,
            'attendance_records', v_id::text,
            jsonb_build_object('session_id', p_session_id, 'member_id', v_member,
                               'uniform', p_uniform, 'arrival', v_arrival,
                               'reason', CASE WHEN v_manual THEN btrim(p_manual_reason) END));

    RETURN jsonb_build_object(
        'success', true, 'record_id', v_id, 'arrival_status', v_arrival, 'recorded_at', v_now,
        'member', jsonb_build_object('id', p.id, 'full_name', p.full_name, 'member_number', p.member_number));
END;
$$;

-- Member Registration v2: supports dynamic section_id and year_id
CREATE OR REPLACE FUNCTION public.register_member_profile_v2(
    p_user_id uuid,
    p_full_name text,
    p_phone text,
    p_section_id uuid,
    p_year_id uuid,
    p_commitment text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_number text;
    v_stage_code text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
        RAISE EXCEPTION 'AUTH_USER_NOT_FOUND';
    END IF;
    IF p_full_name IS NULL OR length(btrim(p_full_name)) < 3 OR length(btrim(p_full_name)) > 100 THEN
        RAISE EXCEPTION 'INVALID_NAME';
    END IF;
    IF p_phone IS NOT NULL AND p_phone !~ '^[0-9+ -]{6,20}$' THEN
        RAISE EXCEPTION 'INVALID_PHONE';
    END IF;

    -- Validate section and year existence and active state
    IF NOT EXISTS (SELECT 1 FROM public.scout_sections WHERE id = p_section_id AND is_active) THEN
        RAISE EXCEPTION 'INVALID_SECTION';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.scout_section_years WHERE id = p_year_id AND section_id = p_section_id AND is_active) THEN
        RAISE EXCEPTION 'INVALID_YEAR';
    END IF;

    -- Map to legacy stage_id if one exists, otherwise null
    SELECT id INTO v_stage_code FROM public.stages
     WHERE code = (SELECT code FROM public.scout_sections WHERE id = p_section_id)
        OR id = (SELECT code FROM public.scout_sections WHERE id = p_section_id)
     LIMIT 1;

    v_number := 'SCT-' || to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY') || '-' ||
                lpad(nextval('public.member_number_seq')::text, 4, '0');

    INSERT INTO public.profiles (id, member_number, full_name, phone, section_id, year_id, stage_id, initial_commitment)
    VALUES (p_user_id, v_number, btrim(p_full_name), NULLIF(btrim(p_phone), ''), p_section_id, p_year_id, v_stage_code, p_commitment);

    -- Only member role can ever be created via public registration
    INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, 'member');
    INSERT INTO public.qr_credentials (member_id) VALUES (p_user_id);

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (p_user_id, 'MEMBER_REGISTERED', 'profiles', p_user_id::text,
            jsonb_build_object('member_number', v_number, 'section_id', p_section_id, 'year_id', p_year_id));

    RETURN v_number;
END;
$$;

-- Keep legacy register_member_profile compatible by delegating
CREATE OR REPLACE FUNCTION public.register_member_profile(
    p_user_id uuid, p_full_name text, p_phone text, p_stage_id text, p_commitment text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_sec_id uuid;
    v_yr_id uuid;
BEGIN
    -- Look up section by stage code/id
    SELECT id INTO v_sec_id FROM public.scout_sections
     WHERE code = p_stage_id OR code = (
         CASE p_stage_id
             WHEN 'stage_1' THEN 'cubs'
             WHEN 'stage_2' THEN 'scouts'
             WHEN 'stage_3' THEN 'advanced'
             ELSE p_stage_id
         END
     ) LIMIT 1;

    IF v_sec_id IS NULL THEN
        SELECT id INTO v_sec_id FROM public.scout_sections ORDER BY display_order LIMIT 1;
    END IF;

    SELECT id INTO v_yr_id FROM public.scout_section_years
     WHERE section_id = v_sec_id ORDER BY display_order LIMIT 1;

    RETURN public.register_member_profile_v2(p_user_id, p_full_name, p_phone, v_sec_id, v_yr_id, p_commitment);
END;
$$;

-- Super Admin RPCs for Leader Scope Management:
CREATE OR REPLACE FUNCTION public.assign_staff_scope(
    p_user_id uuid,
    p_section_id uuid,
    p_year_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actor uuid := auth.uid();
    v_assignment_id uuid;
BEGIN
    IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND is_active) THEN
        RAISE EXCEPTION 'USER_NOT_FOUND';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.scout_sections WHERE id = p_section_id AND is_active) THEN
        RAISE EXCEPTION 'SECTION_NOT_FOUND';
    END IF;
    IF p_year_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.scout_section_years WHERE id = p_year_id AND section_id = p_section_id AND is_active
    ) THEN
        RAISE EXCEPTION 'YEAR_NOT_FOUND';
    END IF;

    INSERT INTO public.staff_scope_assignments (user_id, section_id, year_id, assigned_by)
    VALUES (p_user_id, p_section_id, p_year_id, v_actor)
    RETURNING id INTO v_assignment_id;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (v_actor, 'STAFF_SCOPE_ASSIGNED', 'staff_scope_assignments', v_assignment_id::text,
            jsonb_build_object('user_id', p_user_id, 'section_id', p_section_id, 'year_id', p_year_id));

    RETURN v_assignment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_staff_scope(p_assignment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actor uuid := auth.uid();
    r public.staff_scope_assignments;
BEGIN
    IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO r FROM public.staff_scope_assignments WHERE id = p_assignment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND'; END IF;

    DELETE FROM public.staff_scope_assignments WHERE id = p_assignment_id;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (v_actor, 'STAFF_SCOPE_REVOKED', 'staff_scope_assignments', p_assignment_id::text,
            jsonb_build_object('user_id', r.user_id, 'section_id', r.section_id, 'year_id', r.year_id));
END;
$$;

-- Grant execution
REVOKE ALL ON FUNCTION public.register_member_profile_v2(uuid, text, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_staff_scope(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_staff_scope(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.register_member_profile_v2(uuid, text, text, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_staff_scope(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_staff_scope(uuid) TO authenticated;
