-- IMPORTANT: Review and backup before applying to Production.
-- Extracted from submitted Migration 006 and amended only for publishing privilege boundaries.
-- NOT verified against a live Supabase database; review/test in an isolated production-like DB.
-- Execute the migration atomically (single transaction where supported).
-- Migration 006: Production Auth, Cross-Section & Year Isolation Hardening (Final)
-- ============================================================================
-- 1. Referential Integrity & Discrepancy Verification:
--    - Verify zero mismatched or null distribution_id records before constraint drop
--    - If anomalies exist, HALT immediately with MIGRATION_HALTED (no blind updates)
--    - Safely drop redundant composite FK fk_membership_team_distribution (resolves PGRST201)
--    - Retain team_memberships_team_id_fkey and team_memberships_distribution_id_fkey
-- 2. Strict Scope Isolation Helper Functions:
--    - has_scope_access: year-restricted leaders cannot pass when target_year_id is NULL
--    - has_any_section_scope: checks general section assignment
--    - is_section_leader: verifies active account status (profiles.is_active = TRUE)
--    - is_distribution_published, is_member_in_team, is_member_in_distribution:
--      STABLE SECURITY DEFINER helpers preventing infinite RLS recursion
-- 3. Scoped Row-Level Security (RLS) on Team Tables:
--    - Section leaders only see data strictly within their assigned section and year
--    - Year 1 leader is strictly blocked from reading mixed/other-year distributions
--    - Members can only see their own published team and teammates' names, never private data
-- 4. Conflict-Free Multi-Section and Multi-Year Publishing:
--    - Publishing year-specific roster archives section-wide and same-year active distributions
--    - Publishing section-wide roster archives all published distributions in that section
--    - Prevents scouts from ever appearing in two active published rosters simultaneously
-- 5. Scope-isolated save_team_distribution_draft:
--    - Drop all legacy overloads to guarantee ZERO PostgREST Ambiguous Function Overload
--    - Fixes HTTP 500 (is_leader NOT NULL constraint violation)
--    - Enforces team.section_id equality with p_section_id
--    - Validates member year consistency even if team year is omitted
--    - Rejects staff accounts from being drafted into teams
-- 6. Scope-isolated publish_team_distribution:
--    - Confines archiving strictly to matching section and year scope
--    - Prevents year-restricted leaders from publishing teams of other years
-- 7. Scope-isolated move_draft_member & swap_draft_members:
--    - Verifies distribution, team, and member scope access
--    - Prevents moving/swapping staff accounts or members across years/sections
-- 8. Security Definer Search Path Pinning & Explicit Permission Hardening:
--    - Pins search_path to 'public, auth, pg_temp' on all functions
--    - Revokes default PUBLIC and anon execution on all sensitive functions
-- ============================================================================
-- ----------------------------------------------------------------------------
-- 1. Helper Functions: Active Status, Scopes & Search Path Hardening
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_section_leader(check_user_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE
    v_caller uuid := auth.uid();
BEGIN
    IF check_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    -- Security hardening: authenticated non-admins can only check their own section leader status
    IF v_caller IS NOT NULL AND check_user_id IS DISTINCT FROM v_caller AND NOT public.is_admin(v_caller) THEN
        RETURN FALSE;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.profiles p ON p.id = ur.user_id
        WHERE ur.user_id = check_user_id
          AND p.is_active = TRUE
          AND ur.role IN ('super_admin', 'admin', 'section_leader')
    );
END;
$$;
CREATE OR REPLACE FUNCTION public.has_scope_access(
    check_user_id uuid,
    target_section_id uuid,
    target_year_id uuid DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE
    v_caller uuid := auth.uid();
BEGIN
    IF check_user_id IS NULL OR target_section_id IS NULL THEN
        RETURN FALSE;
    END IF;
    -- Security hardening: authenticated non-admins can only check their own scope access
    IF v_caller IS NOT NULL AND check_user_id IS DISTINCT FROM v_caller AND NOT public.is_admin(v_caller) THEN
        RETURN FALSE;
    END IF;
    -- User profile must exist and be active
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = check_user_id AND is_active = TRUE
    ) THEN
        RETURN FALSE;
    END IF;
    -- 1. Super Admins and global Admins have access to everything
    IF public.is_super_admin(check_user_id) OR EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = check_user_id AND role = 'admin'
    ) THEN
        RETURN TRUE;
    END IF;
    -- 2. Check active staff scope assignment
    IF target_year_id IS NOT NULL THEN
        -- Target year specified: requires wildcard scope (year_id IS NULL) OR exact year match
        RETURN EXISTS (
            SELECT 1 FROM public.staff_scope_assignments
            WHERE user_id = check_user_id
              AND section_id = target_section_id
              AND (year_id IS NULL OR year_id = target_year_id)
        );
    ELSE
        -- Target year is NULL (unscoped/general resource):
        -- ONLY leaders with section-wide wildcard assignment (year_id IS NULL) have access!
        -- A leader assigned only to a specific year does NOT have access to unscoped or other-year resources.
        RETURN EXISTS (
            SELECT 1 FROM public.staff_scope_assignments
            WHERE user_id = check_user_id
              AND section_id = target_section_id
              AND year_id IS NULL
        );
    END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.has_any_section_scope(
    check_user_id uuid,
    target_section_id uuid
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE
    v_caller uuid := auth.uid();
BEGIN
    IF check_user_id IS NULL OR target_section_id IS NULL THEN
        RETURN FALSE;
    END IF;
    -- Security hardening: authenticated non-admins can only check their own section scope
    IF v_caller IS NOT NULL AND check_user_id IS DISTINCT FROM v_caller AND NOT public.is_admin(v_caller) THEN
        RETURN FALSE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = check_user_id AND is_active = TRUE
    ) THEN
        RETURN FALSE;
    END IF;
    IF public.is_super_admin(check_user_id) OR EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = check_user_id AND role = 'admin'
    ) THEN
        RETURN TRUE;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.staff_scope_assignments
        WHERE user_id = check_user_id AND section_id = target_section_id
    );
END;
$$;
CREATE OR REPLACE FUNCTION public.is_distribution_published(p_dist_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.team_distributions
        WHERE id = p_dist_id AND is_current_published = TRUE
    );
$$;
-- Drop obsolete 2-argument membership check signatures that accepted arbitrary user IDs
DROP FUNCTION IF EXISTS public.is_member_in_team(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_member_in_distribution(uuid, uuid);
-- Single-parameter membership checks bound strictly to auth.uid()
-- Authenticated users CANNOT query or probe other members' assignments
CREATE OR REPLACE FUNCTION public.is_member_in_team(p_team_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.team_memberships
        WHERE team_id = p_team_id AND member_id = auth.uid()
    );
$$;
CREATE OR REPLACE FUNCTION public.is_member_in_distribution(p_dist_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.team_memberships
        WHERE distribution_id = p_dist_id AND member_id = auth.uid()
    );
$$;
-- ----------------------------------------------------------------------------
-- 2. Referential Integrity & Foreign Key Safety
-- ----------------------------------------------------------------------------
-- Verify data consistency BEFORE dropping constraint; abort if discrepancies exist.
DO $$
DECLARE
    v_mismatches integer;
    v_nulls integer;
BEGIN
    SELECT count(*) INTO v_mismatches
      FROM public.team_memberships tm
      JOIN public.teams t ON t.id = tm.team_id
     WHERE tm.distribution_id IS DISTINCT FROM t.distribution_id;
    SELECT count(*) INTO v_nulls
      FROM public.team_memberships tm
     WHERE tm.distribution_id IS NULL;
    IF v_mismatches > 0 OR v_nulls > 0 THEN
        RAISE EXCEPTION 'MIGRATION_HALTED: Found % mismatched and % null distribution_id records in team_memberships. Automatic update forbidden. Manual remediation required.', v_mismatches, v_nulls;
    END IF;
END $$;
-- Drop redundant composite foreign key fk_membership_team_distribution safely.
-- team_memberships_team_id_fkey and team_memberships_distribution_id_fkey enforce referential integrity.
ALTER TABLE public.team_memberships
    DROP CONSTRAINT IF EXISTS fk_membership_team_distribution;
-- Add year_id to team_distributions for multi-year independent roster support
ALTER TABLE public.team_distributions
    ADD COLUMN IF NOT EXISTS year_id UUID REFERENCES public.scout_section_years(id);
CREATE INDEX IF NOT EXISTS idx_team_distributions_section_year
    ON public.team_distributions(section_id, year_id);
-- Section and Year-aware unique index for active published distributions
DROP INDEX IF EXISTS public.uq_one_current_published;
DROP INDEX IF EXISTS public.uq_one_current_published_per_section;
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_current_published_per_section_year
    ON public.team_distributions (
        (COALESCE(section_id, '00000000-0000-0000-0000-000000000000'::uuid)),
        (COALESCE(year_id, '00000000-0000-0000-0000-000000000000'::uuid))
    )
    WHERE is_current_published;
-- ----------------------------------------------------------------------------
-- 3. Scoped Row-Level Security (RLS) on Team Tables
-- ----------------------------------------------------------------------------
-- A. team_distributions RLS
DROP POLICY IF EXISTS "Members see published distributions" ON public.team_distributions;
DROP POLICY IF EXISTS "Admins manage distributions" ON public.team_distributions;
DROP POLICY IF EXISTS "Scoped distribution access" ON public.team_distributions;
CREATE POLICY "Scoped distribution access" ON public.team_distributions
    FOR SELECT TO authenticated
    USING (
        -- 1. Admins see all distributions
        public.is_admin(auth.uid())
        -- 2. Section leaders see distributions strictly within their active section and year scope
        OR (
            public.is_section_leader(auth.uid())
            AND section_id IS NOT NULL
            AND (
                -- Leader has section-wide wildcard scope: can read all distributions in section
                public.has_scope_access(auth.uid(), section_id, NULL)
                -- OR leader has specific year scope: can ONLY read if distribution is for their year
                -- and does NOT contain teams of any other year (prevents reading mixed distributions)
                OR (
                    year_id IS NOT NULL
                    AND public.has_scope_access(auth.uid(), section_id, year_id)
                    AND NOT EXISTS (
                        SELECT 1 FROM public.teams t
                        WHERE t.distribution_id = team_distributions.id
                          AND (t.year_id IS NULL OR NOT public.has_scope_access(auth.uid(), team_distributions.section_id, t.year_id))
                    )
                )
            )
        )
        -- 3. Regular scout members see ONLY current published distributions that they are assigned to
        OR (
            is_current_published = TRUE
            AND public.is_member_in_distribution(id)
        )
    );
CREATE POLICY "Admins manage distributions" ON public.team_distributions
    FOR ALL TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));
-- B. teams RLS
DROP POLICY IF EXISTS "Members see published teams" ON public.teams;
DROP POLICY IF EXISTS "Admins manage teams" ON public.teams;
DROP POLICY IF EXISTS "Scoped teams access" ON public.teams;
CREATE POLICY "Scoped teams access" ON public.teams
    FOR SELECT TO authenticated
    USING (
        -- 1. Admins see all teams
        public.is_admin(auth.uid())
        -- 2. Section leaders see teams (draft or published) strictly within their active scope
        OR (
            public.is_section_leader(auth.uid())
            AND public.has_scope_access(auth.uid(), section_id, year_id)
        )
        -- 3. Regular scout members see ONLY their own team in the current published distribution
        OR (
            public.is_distribution_published(distribution_id)
            AND public.is_member_in_team(id)
        )
    );
CREATE POLICY "Admins manage teams" ON public.teams
    FOR ALL TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));
-- C. team_memberships RLS
DROP POLICY IF EXISTS "Own published membership or admin" ON public.team_memberships;
DROP POLICY IF EXISTS "Own published membership or staff" ON public.team_memberships;
DROP POLICY IF EXISTS "Members see published memberships" ON public.team_memberships;
DROP POLICY IF EXISTS "Admins manage memberships" ON public.team_memberships;
DROP POLICY IF EXISTS "Scoped team memberships access" ON public.team_memberships;
CREATE POLICY "Scoped team memberships access" ON public.team_memberships
    FOR SELECT TO authenticated
    USING (
        -- 1. Admins see all memberships
        public.is_admin(auth.uid())
        -- 2. Section leaders see memberships strictly within their active assigned scope
        OR (
            public.is_section_leader(auth.uid())
            AND EXISTS (
                SELECT 1 FROM public.teams t
                WHERE t.id = team_memberships.team_id
                  AND public.has_scope_access(auth.uid(), t.section_id, t.year_id)
            )
        )
        -- 3. Regular scout members see memberships of their OWN team in current published distribution
        OR (
            public.is_distribution_published(distribution_id)
            AND public.is_member_in_team(team_id)
        )
    );
CREATE POLICY "Admins manage memberships" ON public.team_memberships
    FOR ALL TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));
-- ----------------------------------------------------------------------------
-- 4. Scope-Isolated save_team_distribution_draft (Unique Signature - Zero Overload)
-- ----------------------------------------------------------------------------
-- Drop obsolete legacy signatures (4-argument and 6-argument) to prevent PostgREST ambiguous dispatch
DROP FUNCTION IF EXISTS public.save_team_distribution_draft(text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.save_team_distribution_draft(text, text, text, jsonb, uuid, uuid);
-- Retain and update the 5-parameter signature in place using CREATE OR REPLACE (no unnecessary DROP)
CREATE OR REPLACE FUNCTION public.save_team_distribution_draft(
    p_title text,
    p_mode text,
    p_seed text,
    p_teams jsonb,
    p_section_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE
    v_actor uuid := auth.uid();
    v_dist uuid;
    v_team jsonb;
    v_team_id uuid;
    v_member text;
    v_leader uuid;
    v_version integer;
    v_total integer;
    v_distinct integer;
    v_is_active boolean;
    v_team_year uuid;
    v_effective_year uuid;
BEGIN
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
    END IF;
    SELECT is_active INTO v_is_active FROM public.profiles WHERE id = v_actor;
    IF NOT COALESCE(v_is_active, FALSE) THEN
        RAISE EXCEPTION 'USER_INACTIVE' USING ERRCODE = '42501';
    END IF;
    IF NOT public.is_section_leader(v_actor) THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    -- Section scope enforcement
    IF NOT public.is_admin(v_actor) THEN
        IF p_section_id IS NULL THEN
            RAISE EXCEPTION 'SECTION_REQUIRED' USING ERRCODE = '42501';
        END IF;
        IF NOT public.has_any_section_scope(v_actor, p_section_id) THEN
            RAISE EXCEPTION 'UNAUTHORIZED_SECTION_SCOPE' USING ERRCODE = '42501';
        END IF;
    END IF;
    IF p_title IS NULL OR length(btrim(p_title)) < 1 THEN
        RAISE EXCEPTION 'TITLE_REQUIRED';
    END IF;
    IF p_mode IS NULL OR p_mode NOT IN ('mixed_stages', 'separate_stages') THEN
        RAISE EXCEPTION 'INVALID_MODE';
    END IF;
    IF p_teams IS NULL OR jsonb_typeof(p_teams) <> 'array' OR jsonb_array_length(p_teams) = 0 THEN
        RAISE EXCEPTION 'NO_TEAMS';
    END IF;
    -- Verify no empty teams
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_teams) t
        WHERE (t -> 'member_ids') IS NULL 
           OR jsonb_typeof(t -> 'member_ids') <> 'array' 
           OR jsonb_array_length(t -> 'member_ids') = 0
    ) THEN
        RAISE EXCEPTION 'EMPTY_TEAM';
    END IF;
    -- Verify no duplicate members across teams
    SELECT count(*), count(DISTINCT m) INTO v_total, v_distinct
      FROM jsonb_array_elements(p_teams) t, jsonb_array_elements_text(t -> 'member_ids') m;
    IF v_total <> v_distinct THEN
        RAISE EXCEPTION 'DUPLICATE_MEMBER';
    END IF;
    -- Verify all members exist and are active
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_teams) t, jsonb_array_elements_text(t -> 'member_ids') m
          LEFT JOIN public.profiles p ON p.id = m::uuid
         WHERE p.id IS NULL OR NOT p.is_active
    ) THEN
        RAISE EXCEPTION 'INVALID_MEMBER';
    END IF;
    -- Rejection of Staff members from being drafted as team members
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_teams) t, jsonb_array_elements_text(t -> 'member_ids') m
        JOIN public.user_roles ur ON ur.user_id = m::uuid
        WHERE ur.role IN ('super_admin', 'admin', 'section_leader', 'assistant_leader', 'attendance_leader')
    ) THEN
        RAISE EXCEPTION 'STAFF_CANNOT_BE_TEAM_MEMBER' USING ERRCODE = '22023';
    END IF;
    -- Section isolation: ensure all team.section_id match p_section_id
    IF p_section_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_teams) t
        WHERE NULLIF(t ->> 'section_id', '') IS NOT NULL
          AND (t ->> 'section_id')::uuid IS DISTINCT FROM p_section_id
    ) THEN
        RAISE EXCEPTION 'TEAM_SECTION_MISMATCH' USING ERRCODE = '22023';
    END IF;
    -- Member section isolation: ensure all members belong to p_section_id
    IF p_section_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_teams) t, jsonb_array_elements_text(t -> 'member_ids') m
          JOIN public.profiles p ON p.id = m::uuid
         WHERE p.section_id IS DISTINCT FROM p_section_id
    ) THEN
        RAISE EXCEPTION 'MEMBER_SECTION_MISMATCH' USING ERRCODE = '22023';
    END IF;
    -- Team-year & Member-year validation:
    -- If team specifies year_id, member year must match exactly
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_teams) t, jsonb_array_elements_text(t -> 'member_ids') m
          JOIN public.profiles p ON p.id = m::uuid
         WHERE NULLIF(t ->> 'year_id', '') IS NOT NULL
           AND (p.year_id IS NULL OR p.year_id IS DISTINCT FROM (t ->> 'year_id')::uuid)
    ) THEN
        RAISE EXCEPTION 'MEMBER_YEAR_MISMATCH' USING ERRCODE = '22023';
    END IF;
    -- Leader year scope enforcement:
    -- If leader does NOT have wildcard scope (year_id IS NULL) for this section,
    -- all teams and members MUST be explicitly assigned to years within leader's scope.
    IF NOT public.is_admin(v_actor) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.staff_scope_assignments
            WHERE user_id = v_actor AND section_id = p_section_id AND year_id IS NULL
        ) THEN
            -- Check teams have valid year_id within leader scope
            IF EXISTS (
                SELECT 1 FROM jsonb_array_elements(p_teams) t
                WHERE NULLIF(t ->> 'year_id', '') IS NULL
                   OR NOT public.has_scope_access(v_actor, p_section_id, (t ->> 'year_id')::uuid)
            ) THEN
                RAISE EXCEPTION 'UNAUTHORIZED_YEAR_SCOPE' USING ERRCODE = '42501';
            END IF;
            -- Check members have valid year_id within leader scope
            IF EXISTS (
                SELECT 1 FROM jsonb_array_elements(p_teams) t, jsonb_array_elements_text(t -> 'member_ids') m
                  JOIN public.profiles p ON p.id = m::uuid
                 WHERE p.year_id IS NULL OR NOT public.has_scope_access(v_actor, p_section_id, p.year_id)
            ) THEN
                RAISE EXCEPTION 'UNAUTHORIZED_YEAR_SCOPE' USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;
    -- Stage consistency in separate mode
    IF p_mode = 'separate_stages' AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_teams) t, jsonb_array_elements_text(t -> 'member_ids') m
          JOIN public.profiles p ON p.id = m::uuid
         WHERE (t ->> 'stage_id') IS NOT NULL 
           AND p.stage_id IS NOT NULL 
           AND p.stage_id IS DISTINCT FROM (t ->> 'stage_id')
    ) THEN
        RAISE EXCEPTION 'STAGE_MISMATCH';
    END IF;
    -- Infer distribution year_id if all teams have identical year_id
    IF jsonb_array_length(p_teams) > 0 THEN
        SELECT NULLIF(p_teams -> 0 ->> 'year_id', '')::uuid INTO v_effective_year;
        IF v_effective_year IS NOT NULL AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(p_teams) t
            WHERE NULLIF(t ->> 'year_id', '')::uuid IS DISTINCT FROM v_effective_year
        ) THEN
            v_effective_year := NULL; -- Mixed years in draft
        END IF;
    END IF;
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version FROM public.team_distributions;
    INSERT INTO public.team_distributions (
        title, mode, status, version_number, random_seed, created_by, section_id, year_id
    ) VALUES (
        btrim(p_title), p_mode, 'draft', v_version, COALESCE(p_seed, ''), v_actor, p_section_id, v_effective_year
    ) RETURNING id INTO v_dist;
    FOR v_team IN SELECT value FROM jsonb_array_elements(p_teams) LOOP
        v_leader := NULLIF(v_team ->> 'leader_id', '')::uuid;
        IF v_leader IS NOT NULL AND NOT ((v_team -> 'member_ids') @> to_jsonb(v_leader::text)) THEN
            RAISE EXCEPTION 'INVALID_LEADER';
        END IF;
        v_team_year := NULLIF(v_team ->> 'year_id', '')::uuid;
        INSERT INTO public.teams (
            distribution_id, name, stage_id, leader_id, color_hex, icon_name, section_id, year_id
        ) VALUES (
            v_dist,
            btrim(v_team ->> 'name'),
            NULLIF(v_team ->> 'stage_id', ''),
            v_leader,
            COALESCE(v_team ->> 'color_hex', '#23836B'),
            COALESCE(v_team ->> 'icon_name', 'compass'),
            p_section_id,
            v_team_year
        ) RETURNING id INTO v_team_id;
        FOR v_member IN SELECT jsonb_array_elements_text(v_team -> 'member_ids') LOOP
            -- Fix HTTP 500: (v_leader IS NOT NULL AND v_member::uuid = v_leader) evaluates to boolean NOT NULL
            INSERT INTO public.team_memberships (team_id, distribution_id, member_id, is_leader)
            VALUES (v_team_id, v_dist, v_member::uuid, (v_leader IS NOT NULL AND v_member::uuid = v_leader));
        END LOOP;
    END LOOP;
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (v_actor, 'TEAM_DRAFT_SAVED', 'team_distributions', v_dist::text,
            jsonb_build_object('mode', p_mode, 'seed', p_seed, 'teams', jsonb_array_length(p_teams), 'section_id', p_section_id, 'year_id', v_effective_year));
    RETURN v_dist;
END;
$$;
-- ----------------------------------------------------------------------------
-- 5. Scope-Isolated publish_team_distribution
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_team_distribution(p_distribution_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE
    v_actor uuid := auth.uid();
    d public.team_distributions;
    v_is_active boolean;
BEGIN
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
    END IF;
    SELECT is_active INTO v_is_active FROM public.profiles WHERE id = v_actor;
    IF NOT COALESCE(v_is_active, FALSE) THEN
        RAISE EXCEPTION 'USER_INACTIVE' USING ERRCODE = '42501';
    END IF;
    IF NOT public.is_section_leader(v_actor) THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('scouthub.publish_team_distribution'));
    SELECT * INTO d FROM public.team_distributions WHERE id = p_distribution_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DISTRIBUTION_NOT_FOUND'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.teams WHERE distribution_id = p_distribution_id) THEN
        RAISE EXCEPTION 'EMPTY_DISTRIBUTION';
    END IF;
    -- Scope check
    IF NOT public.is_admin(v_actor) THEN
        IF d.section_id IS NULL THEN
            RAISE EXCEPTION 'LEADER_CANNOT_PUBLISH_GLOBAL' USING ERRCODE = '42501';
        END IF;
        IF NOT public.has_any_section_scope(v_actor, d.section_id) THEN
            RAISE EXCEPTION 'UNAUTHORIZED_SECTION_SCOPE' USING ERRCODE = '42501';
        END IF;
        -- If leader is restricted to specific year(s), all teams must match leader's scope
        IF NOT EXISTS (
            SELECT 1 FROM public.staff_scope_assignments
            WHERE user_id = v_actor AND section_id = d.section_id AND year_id IS NULL
        ) THEN
            IF EXISTS (
                SELECT 1 FROM public.teams t
                WHERE t.distribution_id = p_distribution_id
                  AND (t.year_id IS NULL OR NOT public.has_scope_access(v_actor, d.section_id, t.year_id))
            ) THEN
                RAISE EXCEPTION 'UNAUTHORIZED_YEAR_SCOPE' USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;
    -- SECURITY BOUNDARY: only Super Admin may transition between global,
    -- section-wide and year-specific publishing scopes. A restricted leader
    -- may replace only a same-year roster; a section-wide leader may replace
    -- only a section-wide roster, never archive year-specific ones implicitly.
    IF NOT public.is_super_admin(v_actor) THEN
        -- Publishing a new global roster is a Super Admin-only operation.
        IF d.section_id IS NULL THEN
            RAISE EXCEPTION 'GLOBAL_PUBLISH_REQUIRES_SUPER_ADMIN' USING ERRCODE = '42501';
        END IF;
        -- Publishing into any existing global roster would archive it.
        IF EXISTS (
            SELECT 1 FROM public.team_distributions old
            WHERE old.is_current_published = TRUE
              AND old.id <> p_distribution_id
              AND old.section_id IS NULL
        ) THEN
            RAISE EXCEPTION 'GLOBAL_DISTRIBUTION_REQUIRES_SUPER_ADMIN' USING ERRCODE = '42501';
        END IF;
        -- Any section-wide <-> year-specific transition requires Super Admin.
        IF EXISTS (
            SELECT 1 FROM public.team_distributions old
            WHERE old.is_current_published = TRUE
              AND old.id <> p_distribution_id
              AND old.section_id = d.section_id
              AND (
                  (d.year_id IS NULL AND old.year_id IS NOT NULL)
                  OR (d.year_id IS NOT NULL AND old.year_id IS NULL)
              )
        ) THEN
            RAISE EXCEPTION 'SCOPE_TRANSITION_REQUIRES_SUPER_ADMIN' USING ERRCODE = '42501';
        END IF;
        -- A section-wide roster is an unrestricted resource within its section.
        IF d.year_id IS NULL AND NOT public.has_scope_access(v_actor, d.section_id, NULL) THEN
            RAISE EXCEPTION 'SECTION_WIDE_PUBLISH_REQUIRES_ADMIN' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Confine archiving strictly to matching section and year scope,
    -- preventing scouts from appearing in two current published distributions!
    IF d.section_id IS NOT NULL THEN
        IF d.year_id IS NOT NULL THEN
            -- Publishing year-specific roster:
            -- Archive previous published distribution for the SAME year, any section-wide distribution for this section,
            -- and any global distribution (section_id IS NULL)
            UPDATE public.team_distributions
               SET is_current_published = FALSE, status = 'archived', updated_at = now()
             WHERE is_current_published = TRUE
               AND (
                   (section_id = d.section_id AND (year_id = d.year_id OR year_id IS NULL))
                   OR section_id IS NULL
               )
               AND id <> p_distribution_id;
        ELSE
            -- Publishing section-wide roster:
            -- Archive ALL existing published distributions for this section (both section-wide AND year-specific)
            -- and any global distribution (section_id IS NULL)
            UPDATE public.team_distributions
               SET is_current_published = FALSE, status = 'archived', updated_at = now()
             WHERE is_current_published = TRUE
               AND (section_id = d.section_id OR section_id IS NULL)
               AND id <> p_distribution_id;
        END IF;
    ELSE
        -- Publishing global distribution (admin only):
        -- A global distribution covers all sections, so archive ALL active published distributions across the entire organization!
        UPDATE public.team_distributions
           SET is_current_published = FALSE, status = 'archived', updated_at = now()
         WHERE is_current_published = TRUE
           AND id <> p_distribution_id;
    END IF;
    UPDATE public.team_distributions
       SET is_current_published = TRUE, status = 'published', published_at = now(), updated_at = now()
     WHERE id = p_distribution_id;
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (v_actor, 'TEAM_DISTRIBUTION_PUBLISHED', 'team_distributions', p_distribution_id::text,
            jsonb_build_object('previous_status', d.status, 'section_id', d.section_id, 'year_id', d.year_id));
    RETURN jsonb_build_object('success', true, 'distribution_id', p_distribution_id);
END;
$$;
-- ----------------------------------------------------------------------------
-- 6. Scope-Isolated move_draft_member & swap_draft_members
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.move_draft_member(
    p_distribution_id uuid, p_member_id uuid, p_to_team_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE
    v_actor uuid := auth.uid();
    d public.team_distributions;
    v_from uuid;
    v_to_stage text;
    v_to_section uuid;
    v_to_year uuid;
    v_m_section uuid;
    v_m_year uuid;
    v_member_stage text;
    v_is_active boolean;
BEGIN
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
    END IF;
    SELECT is_active INTO v_is_active FROM public.profiles WHERE id = v_actor;
    IF NOT COALESCE(v_is_active, FALSE) THEN
        RAISE EXCEPTION 'USER_INACTIVE' USING ERRCODE = '42501';
    END IF;
    IF NOT public.is_section_leader(v_actor) THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO d FROM public.team_distributions WHERE id = p_distribution_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DISTRIBUTION_NOT_FOUND'; END IF;
    IF d.status <> 'draft' THEN RAISE EXCEPTION 'NOT_DRAFT'; END IF;
    -- Scope check
    IF NOT public.is_admin(v_actor) THEN
        IF d.section_id IS NULL THEN
            RAISE EXCEPTION 'UNAUTHORIZED_SCOPE' USING ERRCODE = '42501';
        END IF;
        IF NOT public.has_any_section_scope(v_actor, d.section_id) THEN
            RAISE EXCEPTION 'UNAUTHORIZED_SECTION_SCOPE' USING ERRCODE = '42501';
        END IF;
        IF d.year_id IS NOT NULL AND NOT public.has_scope_access(v_actor, d.section_id, d.year_id) THEN
            RAISE EXCEPTION 'UNAUTHORIZED_YEAR_SCOPE' USING ERRCODE = '42501';
        END IF;
    END IF;
    -- Member must be in distribution
    SELECT team_id INTO v_from FROM public.team_memberships
     WHERE distribution_id = p_distribution_id AND member_id = p_member_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_IN_DISTRIBUTION'; END IF;
    IF v_from = p_to_team_id THEN RETURN; END IF;
    -- Target team must be in distribution
    SELECT section_id, year_id, stage_id INTO v_to_section, v_to_year, v_to_stage
      FROM public.teams
     WHERE id = p_to_team_id AND distribution_id = p_distribution_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_NOT_IN_DISTRIBUTION'; END IF;
    -- Prevent Staff accounts from being team members
    SELECT section_id, year_id, stage_id INTO v_m_section, v_m_year, v_member_stage
      FROM public.profiles WHERE id = p_member_id;
    IF EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p_member_id
          AND ur.role IN ('super_admin', 'admin', 'section_leader', 'assistant_leader', 'attendance_leader')
    ) THEN
        RAISE EXCEPTION 'STAFF_CANNOT_BE_TEAM_MEMBER' USING ERRCODE = '22023';
    END IF;
    -- Actor scope check for target team
    IF NOT public.is_admin(v_actor) THEN
        IF NOT public.has_scope_access(v_actor, COALESCE(v_to_section, d.section_id), v_to_year) THEN
            RAISE EXCEPTION 'UNAUTHORIZED_YEAR_SCOPE' USING ERRCODE = '42501';
        END IF;
    END IF;
    -- Member section & year consistency
    IF d.section_id IS NOT NULL AND v_m_section IS DISTINCT FROM d.section_id THEN
        RAISE EXCEPTION 'MEMBER_SECTION_MISMATCH' USING ERRCODE = '22023';
    END IF;
    IF (v_to_year IS NOT NULL OR v_m_year IS NOT NULL) AND v_m_year IS DISTINCT FROM v_to_year THEN
        RAISE EXCEPTION 'MEMBER_YEAR_MISMATCH' USING ERRCODE = '22023';
    END IF;
    IF d.mode = 'separate_stages' THEN
        IF v_to_stage IS NOT NULL AND v_member_stage IS NOT NULL AND v_to_stage IS DISTINCT FROM v_member_stage THEN
            RAISE EXCEPTION 'STAGE_MISMATCH';
        END IF;
    END IF;
    UPDATE public.teams SET leader_id = NULL WHERE id = v_from AND leader_id = p_member_id;
    UPDATE public.team_memberships SET team_id = p_to_team_id, is_leader = FALSE
     WHERE distribution_id = p_distribution_id AND member_id = p_member_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.swap_draft_members(
    p_distribution_id uuid, p_member_a uuid, p_member_b uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE
    v_actor uuid := auth.uid();
    d public.team_distributions;
    v_team_a uuid;
    v_team_b uuid;
    v_section_a uuid;
    v_section_b uuid;
    v_year_a uuid;
    v_year_b uuid;
    v_stage_a text;
    v_stage_b text;
    v_m_section_a uuid;
    v_m_section_b uuid;
    v_m_year_a uuid;
    v_m_year_b uuid;
    v_m_stage_a text;
    v_m_stage_b text;
    v_is_active boolean;
BEGIN
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
    END IF;
    SELECT is_active INTO v_is_active FROM public.profiles WHERE id = v_actor;
    IF NOT COALESCE(v_is_active, FALSE) THEN
        RAISE EXCEPTION 'USER_INACTIVE' USING ERRCODE = '42501';
    END IF;
    IF NOT public.is_section_leader(v_actor) THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    IF p_member_a = p_member_b THEN
        RAISE EXCEPTION 'SAME_MEMBER';
    END IF;
    SELECT * INTO d FROM public.team_distributions WHERE id = p_distribution_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DISTRIBUTION_NOT_FOUND'; END IF;
    IF d.status <> 'draft' THEN RAISE EXCEPTION 'NOT_DRAFT'; END IF;
    IF NOT public.is_admin(v_actor) THEN
        IF d.section_id IS NULL THEN
            RAISE EXCEPTION 'UNAUTHORIZED_SCOPE' USING ERRCODE = '42501';
        END IF;
        IF NOT public.has_any_section_scope(v_actor, d.section_id) THEN
            RAISE EXCEPTION 'UNAUTHORIZED_SECTION_SCOPE' USING ERRCODE = '42501';
        END IF;
        IF d.year_id IS NOT NULL AND NOT public.has_scope_access(v_actor, d.section_id, d.year_id) THEN
            RAISE EXCEPTION 'UNAUTHORIZED_YEAR_SCOPE' USING ERRCODE = '42501';
        END IF;
    END IF;
    SELECT team_id INTO v_team_a FROM public.team_memberships WHERE distribution_id = p_distribution_id AND member_id = p_member_a;
    IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_IN_DISTRIBUTION'; END IF;
    SELECT team_id INTO v_team_b FROM public.team_memberships WHERE distribution_id = p_distribution_id AND member_id = p_member_b;
    IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_IN_DISTRIBUTION'; END IF;
    IF v_team_a = v_team_b THEN RETURN; END IF;
    SELECT section_id, year_id, stage_id INTO v_section_a, v_year_a, v_stage_a FROM public.teams WHERE id = v_team_a;
    SELECT section_id, year_id, stage_id INTO v_section_b, v_year_b, v_stage_b FROM public.teams WHERE id = v_team_b;
    IF NOT public.is_admin(v_actor) THEN
        IF NOT public.has_scope_access(v_actor, COALESCE(v_section_a, d.section_id), v_year_a)
           OR NOT public.has_scope_access(v_actor, COALESCE(v_section_b, d.section_id), v_year_b) THEN
            RAISE EXCEPTION 'UNAUTHORIZED_YEAR_SCOPE' USING ERRCODE = '42501';
        END IF;
    END IF;
    SELECT section_id, year_id, stage_id INTO v_m_section_a, v_m_year_a, v_m_stage_a FROM public.profiles WHERE id = p_member_a;
    SELECT section_id, year_id, stage_id INTO v_m_section_b, v_m_year_b, v_m_stage_b FROM public.profiles WHERE id = p_member_b;
    IF EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id IN (p_member_a, p_member_b)
          AND ur.role IN ('super_admin', 'admin', 'section_leader', 'assistant_leader', 'attendance_leader')
    ) THEN
        RAISE EXCEPTION 'STAFF_CANNOT_BE_TEAM_MEMBER' USING ERRCODE = '22023';
    END IF;
    IF d.section_id IS NOT NULL AND (v_m_section_a IS DISTINCT FROM d.section_id OR v_m_section_b IS DISTINCT FROM d.section_id) THEN
        RAISE EXCEPTION 'MEMBER_SECTION_MISMATCH' USING ERRCODE = '22023';
    END IF;
    -- Strict year consistency on swap
    IF (v_year_b IS NOT NULL OR v_m_year_a IS NOT NULL) AND v_m_year_a IS DISTINCT FROM v_year_b THEN
        RAISE EXCEPTION 'MEMBER_YEAR_MISMATCH' USING ERRCODE = '22023';
    END IF;
    IF (v_year_a IS NOT NULL OR v_m_year_b IS NOT NULL) AND v_m_year_b IS DISTINCT FROM v_year_a THEN
        RAISE EXCEPTION 'MEMBER_YEAR_MISMATCH' USING ERRCODE = '22023';
    END IF;
    IF d.mode = 'separate_stages' THEN
        IF (v_stage_b IS NOT NULL AND v_m_stage_a IS NOT NULL AND v_stage_b IS DISTINCT FROM v_m_stage_a)
           OR (v_stage_a IS NOT NULL AND v_m_stage_b IS NOT NULL AND v_stage_a IS DISTINCT FROM v_m_stage_b) THEN
            RAISE EXCEPTION 'STAGE_MISMATCH';
        END IF;
    END IF;
    UPDATE public.teams SET leader_id = NULL
     WHERE id IN (v_team_a, v_team_b) AND leader_id IN (p_member_a, p_member_b);
    UPDATE public.team_memberships
       SET team_id = CASE member_id WHEN p_member_a THEN v_team_b ELSE v_team_a END,
           is_leader = FALSE
     WHERE distribution_id = p_distribution_id AND member_id IN (p_member_a, p_member_b);
END;
$$;
-- ----------------------------------------------------------------------------
-- 7. Safe Member Roster Read (get_my_published_team)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_published_team()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_team public.teams;
    v_members jsonb;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
    SELECT t.* INTO v_team
      FROM public.team_memberships tm
      JOIN public.teams t ON t.id = tm.team_id
      JOIN public.team_distributions d ON d.id = t.distribution_id
     WHERE tm.member_id = v_uid AND d.is_current_published AND d.status = 'published'
     LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    -- Return ONLY public teammate details (names, avatar, role); strictly omit private contact/guardian data
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', p.id,
               'full_name', p.full_name,
               'stage_id', p.stage_id,
               'member_number', p.member_number,
               'avatar_url', p.avatar_url,
               'is_leader', tm.is_leader)
               ORDER BY tm.is_leader DESC, p.full_name), '[]'::jsonb)
      INTO v_members
      FROM public.team_memberships tm
      JOIN public.profiles p ON p.id = tm.member_id
     WHERE tm.team_id = v_team.id AND p.is_active;
    RETURN jsonb_build_object(
        'team', jsonb_build_object('id', v_team.id, 'name', v_team.name, 'stage_id', v_team.stage_id,
                                   'leader_id', v_team.leader_id, 'color_hex', v_team.color_hex,
                                   'icon_name', v_team.icon_name, 'total_points', v_team.total_points),
        'members', v_members);
END;
$$;
-- ----------------------------------------------------------------------------
-- 8. Explicit Permissions Hardening: Revoke PUBLIC / anon & Grant authenticated
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.is_section_leader(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_scope_access(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_any_section_scope(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_distribution_published(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_member_in_team(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_member_in_distribution(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_team_distribution_draft(text, text, text, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publish_team_distribution(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.move_draft_member(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.swap_draft_members(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_published_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_section_leader(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_scope_access(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_any_section_scope(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_distribution_published(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_member_in_team(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_member_in_distribution(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_team_distribution_draft(text, text, text, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_team_distribution(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.move_draft_member(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.swap_draft_members(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_published_team() TO authenticated, service_role;
