-- ==============================================================================
-- SCOUT HUB — 002 PRODUCTION HARDENING
-- Run AFTER 001_initial_schema.sql, exactly once, in order.
--
-- What this migration does:
--   1. Pins search_path on SECURITY DEFINER helpers and adds is_super_admin().
--   2. Closes privilege-escalation paths found in 001 (role assignment, profile
--      self-insert, profile self-update of privileged columns).
--   3. Adds DB-level integrity: one current published distribution, one active QR
--      per member, one membership per member per distribution, Friday-only sessions.
--   4. Removes direct-write policies on attendance / responses / QR credentials;
--      all of those writes now go through SECURITY DEFINER functions that use the
--      server clock and the authenticated caller (auth.uid()).
--   5. Adds transactional functions: publish, draft save/swap/move, attendance,
--      attendance correction, QR rotation, weekly response, member registration.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Helper functions (search_path pinned, execute restricted)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin(check_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = check_user_id AND role IN ('super_admin', 'admin')
    );
$$;

CREATE OR REPLACE FUNCTION public.is_attendance_staff(check_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = check_user_id AND role IN ('super_admin', 'admin', 'attendance_leader')
    );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(check_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = check_user_id AND role = 'super_admin'
    );
$$;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_attendance_staff(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_attendance_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. Privilege-escalation fixes
-- ------------------------------------------------------------------------------
-- Role assignment: ONLY super_admin may write user_roles (001 allowed any admin).
DROP POLICY IF EXISTS "Admins read user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Super Admins manage roles" ON public.user_roles;

CREATE POLICY "Read own roles or admin reads all" ON public.user_roles
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Only super admin manages roles" ON public.user_roles
    FOR ALL TO authenticated
    USING (public.is_super_admin(auth.uid()))
    WITH CHECK (public.is_super_admin(auth.uid()));

-- Profiles: registration happens only through register_member_profile() with the
-- service role. A signed-in user must not be able to insert arbitrary profiles.
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile non-restricted" ON public.profiles;

CREATE POLICY "Update own profile or admin" ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id OR public.is_admin(auth.uid()))
    WITH CHECK (auth.uid() = id OR public.is_admin(auth.uid()));

-- Non-admins may not change privileged columns of their own profile.
CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
        IF NEW.id IS DISTINCT FROM OLD.id
           OR NEW.member_number IS DISTINCT FROM OLD.member_number
           OR NEW.is_active IS DISTINCT FROM OLD.is_active
           OR NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
            RAISE EXCEPTION 'FORBIDDEN_FIELD_UPDATE' USING ERRCODE = '42501';
        END IF;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_update ON public.profiles;
CREATE TRIGGER trg_guard_profile_update
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.guard_profile_update();

-- ------------------------------------------------------------------------------
-- 3. Integrity constraints
-- ------------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.member_number_seq START 1;

-- Exactly one current published distribution, enforced by the database.
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_current_published
    ON public.team_distributions ((is_current_published)) WHERE is_current_published;

ALTER TABLE public.team_distributions
    ADD CONSTRAINT chk_current_implies_published
    CHECK (NOT is_current_published OR status = 'published');

-- One active QR credential per member.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_qr_per_member
    ON public.qr_credentials (member_id) WHERE is_active;

-- A member can appear in only one team per distribution (DB-level).
ALTER TABLE public.team_memberships
    ADD COLUMN IF NOT EXISTS distribution_id uuid REFERENCES public.team_distributions(id) ON DELETE CASCADE;

UPDATE public.team_memberships tm
   SET distribution_id = t.distribution_id
  FROM public.teams t
 WHERE t.id = tm.team_id AND tm.distribution_id IS NULL;

ALTER TABLE public.team_memberships ALTER COLUMN distribution_id SET NOT NULL;

ALTER TABLE public.teams
    ADD CONSTRAINT uq_team_in_distribution UNIQUE (id, distribution_id);

ALTER TABLE public.team_memberships
    ADD CONSTRAINT fk_membership_team_distribution
    FOREIGN KEY (team_id, distribution_id)
    REFERENCES public.teams (id, distribution_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_membership_per_distribution
    ON public.team_memberships (distribution_id, member_id);

-- Friday meetings only (PostgreSQL DOW: Sunday = 0 ... Friday = 5).
ALTER TABLE public.friday_sessions
    ADD CONSTRAINT chk_session_is_friday CHECK (EXTRACT(DOW FROM session_date) = 5);

-- Audit log is append-only for application roles.
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. Policy tightening (direct writes removed; reads minimised)
-- ------------------------------------------------------------------------------
-- Attendance: no direct INSERT/UPDATE from clients. Use record_attendance().
DROP POLICY IF EXISTS "Staff inserts attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Admins update attendance" ON public.attendance_records;

-- Weekly responses: writes only through submit_weekly_response() (deadline check).
DROP POLICY IF EXISTS "Member creates or updates own response" ON public.weekly_responses;

-- QR credentials are bearer secrets: a member reads only their own active one,
-- staff verify through verify_qr_credential(); nobody lists credentials.
DROP POLICY IF EXISTS "Member reads own active QR" ON public.qr_credentials;
DROP POLICY IF EXISTS "Staff manages QR credentials" ON public.qr_credentials;

CREATE POLICY "Member reads own active QR" ON public.qr_credentials
    FOR SELECT TO authenticated
    USING (auth.uid() = member_id AND is_active = TRUE);

-- Team memberships: members see only their own row directly; rosters are served
-- by get_my_published_team() which returns names/stages only.
DROP POLICY IF EXISTS "Members see published memberships" ON public.team_memberships;

-- A member may read their own row ONLY when it belongs to the current published
-- distribution; their rows in drafts / archived versions stay hidden.
CREATE POLICY "Own published membership or admin" ON public.team_memberships
    FOR SELECT TO authenticated
    USING (
        public.is_admin(auth.uid())
        OR (member_id = auth.uid() AND EXISTS (
            SELECT 1 FROM public.team_distributions d
             WHERE d.id = team_memberships.distribution_id AND d.is_current_published))
    );

-- Achievements: own badges or staff.
DROP POLICY IF EXISTS "Everyone reads awarded badges" ON public.member_achievements;
DROP POLICY IF EXISTS "Staff awards achievements" ON public.member_achievements;

CREATE POLICY "Own badges or staff read" ON public.member_achievements
    FOR SELECT TO authenticated
    USING (member_id = auth.uid() OR public.is_attendance_staff(auth.uid()));

CREATE POLICY "Admins award achievements" ON public.member_achievements
    FOR ALL TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

-- ------------------------------------------------------------------------------
-- 5. QR functions
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_my_qr()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_token uuid;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND is_active) THEN
        RAISE EXCEPTION 'NO_ACTIVE_PROFILE';
    END IF;

    INSERT INTO public.qr_credentials (member_id) VALUES (v_uid)
    ON CONFLICT (member_id) WHERE is_active DO NOTHING;

    SELECT id INTO v_token FROM public.qr_credentials WHERE member_id = v_uid AND is_active;
    RETURN v_token;
END;
$$;

-- Rotate: caller must be the member themself or an admin. Serialised per member.
-- The new token is returned only to the member; admins get NULL (they never need
-- to see a member's bearer credential). Tokens are never written to audit_logs.
CREATE OR REPLACE FUNCTION public.rotate_qr_credential(p_member_id uuid, p_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actor uuid := auth.uid();
    v_new uuid;
BEGIN
    IF v_actor IS NULL OR (v_actor <> p_member_id AND NOT public.is_admin(v_actor)) THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;

    PERFORM 1 FROM public.profiles WHERE id = p_member_id AND is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;

    UPDATE public.qr_credentials
       SET is_active = FALSE, revoked_at = now(),
           revocation_reason = COALESCE(NULLIF(btrim(p_reason), ''), 'rotation')
     WHERE member_id = p_member_id AND is_active;

    INSERT INTO public.qr_credentials (member_id) VALUES (p_member_id) RETURNING id INTO v_new;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (v_actor, 'QR_CREDENTIAL_ROTATED', 'profiles', p_member_id::text,
            jsonb_build_object('member_id', p_member_id, 'reason', p_reason));

    IF v_actor = p_member_id THEN RETURN v_new; END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_qr_credential(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    c public.qr_credentials;
    p public.profiles;
    v_team text;
BEGIN
    IF auth.uid() IS NULL OR NOT public.is_attendance_staff(auth.uid()) THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO c FROM public.qr_credentials WHERE id = p_token;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF NOT c.is_active OR c.revoked_at IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'revoked');
    END IF;

    SELECT * INTO p FROM public.profiles WHERE id = c.member_id;
    IF NOT FOUND OR NOT p.is_active THEN RETURN jsonb_build_object('status', 'inactive'); END IF;

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
            'stage_id', p.stage_id, 'team_name', v_team));
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. Attendance functions (server clock, caller identity, DB-level uniqueness)
-- ------------------------------------------------------------------------------
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
        -- The member is ALWAYS derived from the credential; p_member_id is ignored.
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

    -- Lateness is judged against the Cairo wall-clock threshold of the session.
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

-- Correction: admin only, reason mandatory, original timestamp preserved.
CREATE OR REPLACE FUNCTION public.correct_attendance(
    p_record_id uuid,
    p_new_recorded_at timestamptz,
    p_uniform text,
    p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actor uuid := auth.uid();
    r public.attendance_records;
    s public.friday_sessions;
    v_time timestamptz;
    v_uniform text;
BEGIN
    IF v_actor IS NULL OR NOT public.is_admin(v_actor) THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
        RETURN jsonb_build_object('success', false, 'code', 'REASON_REQUIRED');
    END IF;
    IF p_uniform IS NOT NULL AND p_uniform NOT IN ('with_uniform', 'without_uniform') THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_UNIFORM');
    END IF;

    SELECT * INTO r FROM public.attendance_records WHERE id = p_record_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'code', 'RECORD_NOT_FOUND'); END IF;
    SELECT * INTO s FROM public.friday_sessions WHERE id = r.session_id;

    v_time := COALESCE(p_new_recorded_at, r.recorded_at);
    v_uniform := COALESCE(p_uniform, r.uniform_status);

    UPDATE public.attendance_records
       SET original_recorded_at = COALESCE(original_recorded_at, recorded_at),
           recorded_at = v_time,
           uniform_status = v_uniform,
           arrival_status = CASE
               WHEN v_time > ((s.session_date + s.late_threshold_time) AT TIME ZONE 'Africa/Cairo')
               THEN 'late' ELSE 'on_time' END,
           edit_reason = btrim(p_reason),
           edited_by = v_actor
     WHERE id = p_record_id;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (v_actor, 'ATTENDANCE_CORRECTED', 'attendance_records', p_record_id::text,
            jsonb_build_object('before', jsonb_build_object('recorded_at', r.recorded_at, 'uniform', r.uniform_status),
                               'after', jsonb_build_object('recorded_at', v_time, 'uniform', v_uniform),
                               'reason', btrim(p_reason)));

    RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_weekly_response(p_session_id uuid, p_response text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid uuid := auth.uid();
    s public.friday_sessions;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
    IF p_response IS NULL OR p_response NOT IN ('attending', 'absent', 'circumstances') THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_RESPONSE');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND is_active) THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_ACTIVE_PROFILE');
    END IF;

    SELECT * INTO s FROM public.friday_sessions WHERE id = p_session_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'code', 'SESSION_NOT_FOUND'); END IF;
    IF s.response_deadline IS NOT NULL AND now() > s.response_deadline THEN
        RETURN jsonb_build_object('success', false, 'code', 'DEADLINE_PASSED');
    END IF;

    INSERT INTO public.weekly_responses (session_id, member_id, response)
    VALUES (p_session_id, v_uid, p_response)
    ON CONFLICT (session_id, member_id)
    DO UPDATE SET response = EXCLUDED.response, updated_at = now();

    RETURN jsonb_build_object('success', true, 'response', p_response);
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. Team distribution functions (atomic; admin only)
-- ------------------------------------------------------------------------------
-- p_teams: [{ "name": text, "stage_id": text|null, "color_hex": text, "icon_name": text,
--             "leader_id": uuid|null, "member_ids": [uuid, ...] }, ...]
CREATE OR REPLACE FUNCTION public.save_team_distribution_draft(
    p_title text, p_mode text, p_seed text, p_teams jsonb
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
BEGIN
    IF v_actor IS NULL OR NOT public.is_admin(v_actor) THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    IF p_title IS NULL OR length(btrim(p_title)) < 1 THEN RAISE EXCEPTION 'TITLE_REQUIRED'; END IF;
    IF p_mode IS NULL OR p_mode NOT IN ('mixed_stages', 'separate_stages') THEN RAISE EXCEPTION 'INVALID_MODE'; END IF;
    IF p_teams IS NULL OR jsonb_typeof(p_teams) <> 'array' OR jsonb_array_length(p_teams) = 0 THEN
        RAISE EXCEPTION 'NO_TEAMS';
    END IF;

    SELECT count(*), count(DISTINCT m) INTO v_total, v_distinct
      FROM jsonb_array_elements(p_teams) t, jsonb_array_elements_text(t -> 'member_ids') m;
    IF v_total <> v_distinct THEN RAISE EXCEPTION 'DUPLICATE_MEMBER'; END IF;

    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_teams) t, jsonb_array_elements_text(t -> 'member_ids') m
          LEFT JOIN public.profiles p ON p.id = m::uuid
         WHERE p.id IS NULL OR NOT p.is_active
    ) THEN RAISE EXCEPTION 'INVALID_MEMBER'; END IF;

    IF p_mode = 'separate_stages' AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_teams) t, jsonb_array_elements_text(t -> 'member_ids') m
          JOIN public.profiles p ON p.id = m::uuid
         WHERE p.stage_id IS DISTINCT FROM (t ->> 'stage_id')
    ) THEN RAISE EXCEPTION 'STAGE_MISMATCH'; END IF;

    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version FROM public.team_distributions;

    INSERT INTO public.team_distributions (title, mode, status, version_number, random_seed, created_by)
    VALUES (btrim(p_title), p_mode, 'draft', v_version, COALESCE(p_seed, ''), v_actor)
    RETURNING id INTO v_dist;

    FOR v_team IN SELECT value FROM jsonb_array_elements(p_teams) LOOP
        v_leader := NULLIF(v_team ->> 'leader_id', '')::uuid;
        IF v_leader IS NOT NULL AND NOT ((v_team -> 'member_ids') @> to_jsonb(v_leader::text)) THEN
            RAISE EXCEPTION 'INVALID_LEADER';
        END IF;

        INSERT INTO public.teams (distribution_id, name, stage_id, leader_id, color_hex, icon_name)
        VALUES (v_dist, btrim(v_team ->> 'name'), NULLIF(v_team ->> 'stage_id', ''), v_leader,
                COALESCE(v_team ->> 'color_hex', '#23836B'), COALESCE(v_team ->> 'icon_name', 'compass'))
        RETURNING id INTO v_team_id;

        FOR v_member IN SELECT jsonb_array_elements_text(v_team -> 'member_ids') LOOP
            INSERT INTO public.team_memberships (team_id, distribution_id, member_id, is_leader)
            VALUES (v_team_id, v_dist, v_member::uuid, v_member::uuid = v_leader);
        END LOOP;
    END LOOP;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (v_actor, 'TEAM_DRAFT_SAVED', 'team_distributions', v_dist::text,
            jsonb_build_object('mode', p_mode, 'seed', p_seed, 'teams', jsonb_array_length(p_teams)));

    RETURN v_dist;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_draft_member(
    p_distribution_id uuid, p_member_id uuid, p_to_team_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actor uuid := auth.uid();
    d public.team_distributions;
    v_from uuid;
    v_to_stage text;
    v_member_stage text;
BEGIN
    IF v_actor IS NULL OR NOT public.is_admin(v_actor) THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO d FROM public.team_distributions WHERE id = p_distribution_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DISTRIBUTION_NOT_FOUND'; END IF;
    IF d.status <> 'draft' THEN RAISE EXCEPTION 'NOT_DRAFT'; END IF;

    SELECT team_id INTO v_from FROM public.team_memberships
     WHERE distribution_id = p_distribution_id AND member_id = p_member_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_IN_DISTRIBUTION'; END IF;

    SELECT stage_id INTO v_to_stage FROM public.teams
     WHERE id = p_to_team_id AND distribution_id = p_distribution_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_NOT_FOUND'; END IF;

    IF d.mode = 'separate_stages' THEN
        SELECT stage_id INTO v_member_stage FROM public.profiles WHERE id = p_member_id;
        IF v_member_stage IS DISTINCT FROM v_to_stage THEN RAISE EXCEPTION 'STAGE_MISMATCH'; END IF;
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
BEGIN
    IF v_actor IS NULL OR NOT public.is_admin(v_actor) THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;
    IF p_member_a = p_member_b THEN RAISE EXCEPTION 'SAME_MEMBER'; END IF;

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
        IF v_stage_a IS DISTINCT FROM v_stage_b THEN RAISE EXCEPTION 'STAGE_MISMATCH'; END IF;
    END IF;

    UPDATE public.teams SET leader_id = NULL
     WHERE id IN (v_team_a, v_team_b) AND leader_id IN (p_member_a, p_member_b);
    UPDATE public.team_memberships
       SET team_id = CASE member_id WHEN p_member_a THEN v_team_b ELSE v_team_a END,
           is_leader = FALSE
     WHERE distribution_id = p_distribution_id AND member_id IN (p_member_a, p_member_b);
END;
$$;

-- Atomic publish. Serialised with an advisory lock; archive-then-promote happens in
-- one transaction, so a failure leaves the previous published version untouched and
-- two concurrent publishes can never both become "current" (also enforced by the
-- uq_one_current_published partial unique index).
CREATE OR REPLACE FUNCTION public.publish_team_distribution(p_distribution_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actor uuid := auth.uid();
    d public.team_distributions;
BEGIN
    IF v_actor IS NULL OR NOT public.is_admin(v_actor) THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('scouthub.publish_team_distribution'));

    SELECT * INTO d FROM public.team_distributions WHERE id = p_distribution_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DISTRIBUTION_NOT_FOUND'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.teams WHERE distribution_id = p_distribution_id) THEN
        RAISE EXCEPTION 'EMPTY_DISTRIBUTION';
    END IF;

    UPDATE public.team_distributions
       SET is_current_published = FALSE, status = 'archived', updated_at = now()
     WHERE is_current_published AND id <> p_distribution_id;

    UPDATE public.team_distributions
       SET is_current_published = TRUE, status = 'published', published_at = now(), updated_at = now()
     WHERE id = p_distribution_id;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (v_actor, 'TEAM_DISTRIBUTION_PUBLISHED', 'team_distributions', p_distribution_id::text,
            jsonb_build_object('previous_status', d.status));

    RETURN jsonb_build_object('success', true, 'distribution_id', p_distribution_id);
END;
$$;

-- Member-facing roster: only names / stage / leader flag, only for the caller's own
-- team in the CURRENT PUBLISHED distribution. No phones, no commitment data.
CREATE OR REPLACE FUNCTION public.get_my_published_team()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', p.id, 'full_name', p.full_name, 'stage_id', p.stage_id, 'is_leader', tm.is_leader)
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

-- ------------------------------------------------------------------------------
-- 8. Registration (service role only): profile + role + QR in ONE transaction
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_member_profile(
    p_user_id uuid, p_full_name text, p_phone text, p_stage_id text, p_commitment text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_number text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN RAISE EXCEPTION 'AUTH_USER_NOT_FOUND'; END IF;
    IF p_full_name IS NULL OR length(btrim(p_full_name)) < 3 OR length(btrim(p_full_name)) > 100 THEN
        RAISE EXCEPTION 'INVALID_NAME';
    END IF;
    IF p_phone IS NOT NULL AND p_phone !~ '^[0-9+ -]{6,20}$' THEN RAISE EXCEPTION 'INVALID_PHONE'; END IF;

    v_number := 'SCT-' || to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY') || '-' ||
                lpad(nextval('public.member_number_seq')::text, 4, '0');

    INSERT INTO public.profiles (id, member_number, full_name, phone, stage_id, initial_commitment)
    VALUES (p_user_id, v_number, btrim(p_full_name), NULLIF(btrim(p_phone), ''), p_stage_id, p_commitment);

    -- Public registration can only ever create the plain 'member' role.
    INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, 'member');
    INSERT INTO public.qr_credentials (member_id) VALUES (p_user_id);

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (p_user_id, 'MEMBER_REGISTERED', 'profiles', p_user_id::text,
            jsonb_build_object('member_number', v_number, 'stage_id', p_stage_id));

    RETURN v_number;
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. Function privileges
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_or_create_my_qr() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rotate_qr_credential(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_qr_credential(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_attendance(uuid, text, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.correct_attendance(uuid, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_weekly_response(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_team_distribution_draft(text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.move_draft_member(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.swap_draft_members(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publish_team_distribution(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_published_team() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_member_profile(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_or_create_my_qr() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_qr_credential(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_qr_credential(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_attendance(uuid, text, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.correct_attendance(uuid, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_weekly_response(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_team_distribution_draft(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_draft_member(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.swap_draft_members(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_team_distribution(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_published_team() TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_member_profile(uuid, text, text, text, text) TO service_role;
