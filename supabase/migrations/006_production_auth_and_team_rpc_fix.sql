-- Migration 006: Production Auth & Team Distribution Hardening
-- ============================================================================
-- 1. Fix save_team_distribution_draft is_leader NULL constraint violation
-- 2. Allow section leaders to view draft team memberships under RLS
-- 3. Allow section leaders to publish team distributions within their section scope
-- 4. Allow section leaders to move/swap draft members
-- 5. Scope published distribution archiving by section_id (preserves multi-section rosters)
-- 6. Resolve PostgREST ambiguous relationships between teams and team_memberships
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Team Memberships RLS: Allow Section Leaders to view draft memberships
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Own published membership or admin" ON public.team_memberships;
DROP POLICY IF EXISTS "Own published membership or staff" ON public.team_memberships;

CREATE POLICY "Own published membership or staff" ON public.team_memberships
    FOR SELECT TO authenticated
    USING (
        public.is_admin(auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin', 'section_leader')
        )
        OR (member_id = auth.uid() AND EXISTS (
            SELECT 1 FROM public.team_distributions d
             WHERE d.id = team_memberships.distribution_id AND d.is_current_published
        ))
    );

-- ----------------------------------------------------------------------------
-- 2. Remove redundant composite foreign key to fix PostgREST embedding ambiguity
--    team_memberships_team_id_fkey already guarantees foreign key integrity to teams(id)
-- ----------------------------------------------------------------------------
ALTER TABLE public.team_memberships
    DROP CONSTRAINT IF EXISTS fk_membership_team_distribution;

-- Section-aware unique index for published distributions (supports multi-section troop)
DROP INDEX IF EXISTS public.uq_one_current_published;

CREATE UNIQUE INDEX IF NOT EXISTS uq_one_current_published_per_section
    ON public.team_distributions ((COALESCE(section_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    WHERE is_current_published;

-- ----------------------------------------------------------------------------
-- 3. Fix save_team_distribution_draft: handle NULL v_leader safely
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_team_distribution_draft(
    p_title text,
    p_mode text,
    p_seed text,
    p_teams jsonb,
    p_section_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    v_is_authorized boolean := false;
BEGIN
    -- Check permissions: Super Admin, Admin, or Section Leader
    IF v_actor IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles
             WHERE user_id = v_actor
               AND role IN ('super_admin', 'admin', 'section_leader')
        ) INTO v_is_authorized;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
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

    -- Verify no duplicates across teams
    SELECT count(*), count(DISTINCT m) INTO v_total, v_distinct
      FROM jsonb_array_elements(p_teams) t, jsonb_array_elements_text(t -> 'member_ids') m;
    IF v_total <> v_distinct THEN
        RAISE EXCEPTION 'DUPLICATE_MEMBER';
    END IF;

    -- Verify every member exists and is active
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_teams) t, jsonb_array_elements_text(t -> 'member_ids') m
          LEFT JOIN public.profiles p ON p.id = m::uuid
         WHERE p.id IS NULL OR NOT p.is_active
    ) THEN
        RAISE EXCEPTION 'INVALID_MEMBER';
    END IF;

    -- Verify stage/section consistency in separate mode only when stage_id is specified
    IF p_mode = 'separate_stages' AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_teams) t, jsonb_array_elements_text(t -> 'member_ids') m
          JOIN public.profiles p ON p.id = m::uuid
         WHERE (t ->> 'stage_id') IS NOT NULL 
           AND p.stage_id IS NOT NULL 
           AND p.stage_id IS DISTINCT FROM (t ->> 'stage_id')
    ) THEN
        RAISE EXCEPTION 'STAGE_MISMATCH';
    END IF;

    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version FROM public.team_distributions;

    INSERT INTO public.team_distributions (
        title, mode, status, version_number, random_seed, created_by, section_id
    ) VALUES (
        btrim(p_title), p_mode, 'draft', v_version, COALESCE(p_seed, ''), v_actor, p_section_id
    ) RETURNING id INTO v_dist;

    FOR v_team IN SELECT value FROM jsonb_array_elements(p_teams) LOOP
        v_leader := NULLIF(v_team ->> 'leader_id', '')::uuid;
        IF v_leader IS NOT NULL AND NOT ((v_team -> 'member_ids') @> to_jsonb(v_leader::text)) THEN
            RAISE EXCEPTION 'INVALID_LEADER';
        END IF;

        INSERT INTO public.teams (
            distribution_id, name, stage_id, leader_id, color_hex, icon_name, section_id
        ) VALUES (
            v_dist,
            btrim(v_team ->> 'name'),
            NULLIF(v_team ->> 'stage_id', ''),
            v_leader,
            COALESCE(v_team ->> 'color_hex', '#23836B'),
            COALESCE(v_team ->> 'icon_name', 'compass'),
            COALESCE(NULLIF(v_team ->> 'section_id', '')::uuid, p_section_id)
        ) RETURNING id INTO v_team_id;

        FOR v_member IN SELECT jsonb_array_elements_text(v_team -> 'member_ids') LOOP
            -- Fix: v_member::uuid = v_leader evaluates to NULL when v_leader is NULL,
            -- violating NOT NULL constraint on team_memberships.is_leader.
            -- Using boolean expression (v_leader IS NOT NULL AND v_member::uuid = v_leader) guarantees NOT NULL.
            INSERT INTO public.team_memberships (team_id, distribution_id, member_id, is_leader)
            VALUES (v_team_id, v_dist, v_member::uuid, (v_leader IS NOT NULL AND v_member::uuid = v_leader));
        END LOOP;
    END LOOP;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (v_actor, 'TEAM_DRAFT_SAVED', 'team_distributions', v_dist::text,
            jsonb_build_object('mode', p_mode, 'seed', p_seed, 'teams', jsonb_array_length(p_teams), 'section_id', p_section_id));

    RETURN v_dist;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Fix publish_team_distribution: authorize section leaders & preserve multi-section rosters
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_team_distribution(p_distribution_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actor uuid := auth.uid();
    d public.team_distributions;
    v_is_authorized boolean := false;
BEGIN
    IF v_actor IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles
             WHERE user_id = v_actor
               AND role IN ('super_admin', 'admin', 'section_leader')
        ) INTO v_is_authorized;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('scouthub.publish_team_distribution'));

    SELECT * INTO d FROM public.team_distributions WHERE id = p_distribution_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DISTRIBUTION_NOT_FOUND'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.teams WHERE distribution_id = p_distribution_id) THEN
        RAISE EXCEPTION 'EMPTY_DISTRIBUTION';
    END IF;

    -- If section leader, verify section scope if distribution is section-specific
    IF NOT public.is_admin(v_actor) AND d.section_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.staff_scope_assignments
             WHERE user_id = v_actor AND section_id = d.section_id
        ) THEN
            RAISE EXCEPTION 'UNAUTHORIZED_SCOPE' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Archive previous published distribution:
    -- If distribution belongs to a specific section, archive only that section's published distribution.
    -- If distribution is global (section_id IS NULL), archive only global published distributions.
    IF d.section_id IS NOT NULL THEN
        UPDATE public.team_distributions
           SET is_current_published = FALSE, status = 'archived', updated_at = now()
         WHERE is_current_published AND section_id = d.section_id AND id <> p_distribution_id;
    ELSE
        UPDATE public.team_distributions
           SET is_current_published = FALSE, status = 'archived', updated_at = now()
         WHERE is_current_published AND id <> p_distribution_id;
    END IF;

    UPDATE public.team_distributions
       SET is_current_published = TRUE, status = 'published', published_at = now(), updated_at = now()
     WHERE id = p_distribution_id;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (v_actor, 'TEAM_DISTRIBUTION_PUBLISHED', 'team_distributions', p_distribution_id::text,
            jsonb_build_object('previous_status', d.status, 'section_id', d.section_id));

    RETURN jsonb_build_object('success', true, 'distribution_id', p_distribution_id);
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Fix move_draft_member & swap_draft_members: authorize section leaders
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.move_draft_member(
    p_distribution_id uuid, p_member_id uuid, p_to_team_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actor uuid := auth.uid();
    d public.team_distributions;
    v_from uuid;
    v_to_stage text;
    v_member_stage text;
    v_is_authorized boolean := false;
BEGIN
    IF v_actor IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles
             WHERE user_id = v_actor
               AND role IN ('super_admin', 'admin', 'section_leader')
        ) INTO v_is_authorized;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO d FROM public.team_distributions WHERE id = p_distribution_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DISTRIBUTION_NOT_FOUND'; END IF;
    IF d.status <> 'draft' THEN RAISE EXCEPTION 'NOT_DRAFT'; END IF;

    SELECT team_id INTO v_from FROM public.team_memberships
     WHERE distribution_id = p_distribution_id AND member_id = p_member_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_IN_DISTRIBUTION'; END IF;

    IF v_from = p_to_team_id THEN RETURN; END IF;

    IF d.mode = 'separate_stages' THEN
        SELECT stage_id INTO v_to_stage FROM public.teams WHERE id = p_to_team_id AND distribution_id = p_distribution_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_NOT_IN_DISTRIBUTION'; END IF;
        SELECT stage_id INTO v_member_stage FROM public.profiles WHERE id = p_member_id;
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
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actor uuid := auth.uid();
    d public.team_distributions;
    v_team_a uuid;
    v_team_b uuid;
    v_stage_a text;
    v_stage_b text;
    v_is_authorized boolean := false;
BEGIN
    IF v_actor IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles
             WHERE user_id = v_actor
               AND role IN ('super_admin', 'admin', 'section_leader')
        ) INTO v_is_authorized;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO d FROM public.team_distributions WHERE id = p_distribution_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DISTRIBUTION_NOT_FOUND'; END IF;
    IF d.status <> 'draft' THEN RAISE EXCEPTION 'NOT_DRAFT'; END IF;

    SELECT team_id INTO v_team_a FROM public.team_memberships WHERE distribution_id = p_distribution_id AND member_id = p_member_a;
    IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_IN_DISTRIBUTION'; END IF;
    SELECT team_id INTO v_team_b FROM public.team_memberships WHERE distribution_id = p_distribution_id AND member_id = p_member_b;
    IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_IN_DISTRIBUTION'; END IF;
    IF v_team_a = v_team_b THEN RETURN; END IF;

    IF d.mode = 'separate_stages' THEN
        SELECT stage_id INTO v_stage_a FROM public.profiles WHERE id = p_member_a;
        SELECT stage_id INTO v_stage_b FROM public.profiles WHERE id = p_member_b;
        IF v_stage_a IS NOT NULL AND v_stage_b IS NOT NULL AND v_stage_a IS DISTINCT FROM v_stage_b THEN
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
-- 6. Grants & Permissions
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.save_team_distribution_draft(text, text, text, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_team_distribution(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.move_draft_member(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.swap_draft_members(uuid, uuid, uuid) TO authenticated, service_role;
