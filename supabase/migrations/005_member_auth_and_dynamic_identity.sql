-- Migration 005: Member Auth & Dynamic Identity Hardening
-- ============================================================================
-- 1. Updates save_team_distribution_draft to support dynamic sections,
--    role isolation for section leaders, and graceful null stage compatibility.
-- 2. Grants section leaders draft visibility under RLS.
-- 3. Adds delete_member_permanent RPC with safe transactional cascading.
-- 4. Search path pinned and idempotent for production safety.
-- ============================================================================

-- Drop old 4-arg signature to avoid Postgres function overload ambiguity with DEFAULT NULL
DROP FUNCTION IF EXISTS public.save_team_distribution_draft(text, text, text, jsonb);

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
            INSERT INTO public.team_memberships (team_id, distribution_id, member_id, is_leader)
            VALUES (v_team_id, v_dist, v_member::uuid, v_member::uuid = v_leader);
        END LOOP;
    END LOOP;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (v_actor, 'TEAM_DRAFT_SAVED', 'team_distributions', v_dist::text,
            jsonb_build_object('mode', p_mode, 'seed', p_seed, 'teams', jsonb_array_length(p_teams), 'section_id', p_section_id));

    RETURN v_dist;
END;
$$;

-- Allow Section Leaders and Admins to view drafts for their sections
DROP POLICY IF EXISTS "Members see published distributions" ON public.team_distributions;
CREATE POLICY "Members see published distributions" ON public.team_distributions
    FOR SELECT TO authenticated USING (
        is_current_published = TRUE
        OR public.is_admin(auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin', 'section_leader')
        )
    );

DROP POLICY IF EXISTS "Members see published teams" ON public.teams;
CREATE POLICY "Members see published teams" ON public.teams
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.team_distributions d WHERE d.id = distribution_id AND (
            d.is_current_published = TRUE
            OR public.is_admin(auth.uid())
            OR EXISTS (
                SELECT 1 FROM public.user_roles
                WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin', 'section_leader')
            )
        ))
    );

-- Permanent member deletion with full cascade
CREATE OR REPLACE FUNCTION public.delete_member_permanent(
    p_member_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actor uuid := auth.uid();
    v_target_name text;
    v_target_num text;
    v_is_target_admin boolean;
BEGIN
    IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
        RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN');
    END IF;

    IF p_member_id = v_actor THEN
        RETURN jsonb_build_object('success', false, 'code', 'CANNOT_DELETE_SELF');
    END IF;

    SELECT full_name, member_number INTO v_target_name, v_target_num
      FROM public.profiles WHERE id = p_member_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'MEMBER_NOT_FOUND');
    END IF;

    -- Prevent deleting super admin or admin through member deletion
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
         WHERE user_id = p_member_id AND role IN ('super_admin', 'admin')
    ) INTO v_is_target_admin;

    IF v_is_target_admin THEN
        RETURN jsonb_build_object('success', false, 'code', 'CANNOT_DELETE_SUPER_ADMIN');
    END IF;

    -- Nullify audit logs where target was actor to avoid FK violation
    UPDATE public.audit_logs SET actor_id = NULL WHERE actor_id = p_member_id;

    -- Cascading cleanup of child records
    DELETE FROM public.attendance_records WHERE member_id = p_member_id;
    DELETE FROM public.weekly_responses WHERE member_id = p_member_id;
    DELETE FROM public.team_memberships WHERE member_id = p_member_id;
    DELETE FROM public.qr_credentials WHERE member_id = p_member_id;
    DELETE FROM public.staff_scope_assignments WHERE user_id = p_member_id;
    DELETE FROM public.user_roles WHERE user_id = p_member_id;
    DELETE FROM public.profiles WHERE id = p_member_id;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (v_actor, 'MEMBER_PERMANENTLY_DELETED', 'profiles', p_member_id::text,
            jsonb_build_object('full_name', v_target_name, 'member_number', v_target_num));

    RETURN jsonb_build_object('success', true, 'deleted_member_id', p_member_id);
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.save_team_distribution_draft(text, text, text, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_member_permanent(uuid) TO authenticated, service_role;
