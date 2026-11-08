-- ============================================================================
-- Migration 004: Friday Meetings Multi-Section Management & Member Lifecycle
-- Alfanar Scouts Platform (كشافة الفنار)
-- ============================================================================

-- 1. Relax Constraints on friday_sessions to support multi-section Friday meetings
-- ----------------------------------------------------------------------------
-- Drop single-column unique constraint on session_date to allow separate meetings for different sections on the same date
ALTER TABLE public.friday_sessions
    DROP CONSTRAINT IF EXISTS friday_sessions_session_date_key;

-- Drop check constraint requiring date to strictly be a Friday (allows special gatherings, feast day camps, etc.)
ALTER TABLE public.friday_sessions
    DROP CONSTRAINT IF EXISTS chk_session_is_friday;

-- Add meeting status and optional year scoping
ALTER TABLE public.friday_sessions
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'scheduled',
    ADD COLUMN IF NOT EXISTS year_id UUID REFERENCES public.scout_section_years(id) ON DELETE SET NULL;

-- Ensure status matches valid values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_friday_sessions_status'
    ) THEN
        ALTER TABLE public.friday_sessions
            ADD CONSTRAINT chk_friday_sessions_status
            CHECK (status IN ('scheduled', 'open', 'closed', 'cancelled'));
    END IF;
END $$;

-- Create composite unique index: on a given date, at most one general session (section_id IS NULL)
-- and at most one session per scout section.
CREATE UNIQUE INDEX IF NOT EXISTS uq_session_date_section
    ON public.friday_sessions (session_date, (COALESCE(section_id, '00000000-0000-0000-0000-000000000000'::uuid)));

CREATE INDEX IF NOT EXISTS idx_friday_sessions_year ON public.friday_sessions(year_id);
CREATE INDEX IF NOT EXISTS idx_friday_sessions_status ON public.friday_sessions(status);

-- Backfill status based on existing sessions
UPDATE public.friday_sessions
SET status = CASE
    WHEN is_open_for_attendance THEN 'open'
    WHEN session_date < CURRENT_DATE THEN 'closed'
    ELSE 'scheduled'
END
WHERE status = 'scheduled';

-- Trigger: Keep status and is_open_for_attendance in sync
CREATE OR REPLACE FUNCTION public.sync_friday_session_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.is_open_for_attendance THEN
            NEW.status := 'open';
        ELSIF NEW.status = 'open' THEN
            NEW.is_open_for_attendance := true;
        ELSE
            NEW.is_open_for_attendance := false;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            IF NEW.status = 'open' THEN
                NEW.is_open_for_attendance := true;
            ELSE
                NEW.is_open_for_attendance := false;
            END IF;
        ELSIF NEW.is_open_for_attendance IS DISTINCT FROM OLD.is_open_for_attendance THEN
            IF NEW.is_open_for_attendance THEN
                NEW.status := 'open';
            ELSE
                NEW.status := 'closed';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_friday_session_status ON public.friday_sessions;
CREATE TRIGGER trg_sync_friday_session_status
    BEFORE INSERT OR UPDATE ON public.friday_sessions
    FOR EACH ROW EXECUTE FUNCTION public.sync_friday_session_status();

-- 2. Enhanced RLS Policies for Sessions and Attendance Records
-- ----------------------------------------------------------------------------
-- Ensure super admin and admin can manage all friday sessions
DROP POLICY IF EXISTS "Admins manage sessions" ON public.friday_sessions;
CREATE POLICY "Admins manage sessions" ON public.friday_sessions
    FOR ALL TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

-- Ensure attendance records policies cover staff inserts, updates, and deletes
DROP POLICY IF EXISTS "Staff insert attendance records" ON public.attendance_records;
CREATE POLICY "Staff insert attendance records" ON public.attendance_records
    FOR INSERT TO authenticated
    WITH CHECK (public.is_attendance_staff(auth.uid()));

-- Allow staff to update attendance records (e.g. uniform correction)
DROP POLICY IF EXISTS "Staff update attendance records" ON public.attendance_records;
CREATE POLICY "Staff update attendance records" ON public.attendance_records
    FOR UPDATE TO authenticated
    USING (public.is_attendance_staff(auth.uid()))
    WITH CHECK (public.is_attendance_staff(auth.uid()));

-- Allow staff to delete mistakenly recorded attendance records
DROP POLICY IF EXISTS "Staff delete attendance records" ON public.attendance_records;
CREATE POLICY "Staff delete attendance records" ON public.attendance_records
    FOR DELETE TO authenticated
    USING (public.is_attendance_staff(auth.uid()));

-- Allow super admins to delete profiles
DROP POLICY IF EXISTS "Super admins delete profiles" ON public.profiles;
CREATE POLICY "Super admins delete profiles" ON public.profiles
    FOR DELETE TO authenticated
    USING (public.is_super_admin(auth.uid()));

-- 3. Stored Functions for Attendance & Session Management
-- ----------------------------------------------------------------------------

-- Delete attendance record RPC with audit logging
CREATE OR REPLACE FUNCTION public.delete_attendance_record(
    p_record_id uuid,
    p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actor uuid := auth.uid();
    v_rec public.attendance_records;
    v_member public.profiles;
BEGIN
    IF v_actor IS NULL OR NOT public.is_attendance_staff(v_actor) THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_rec FROM public.attendance_records WHERE id = p_record_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'RECORD_NOT_FOUND');
    END IF;

    SELECT * INTO v_member FROM public.profiles WHERE id = v_rec.member_id;

    DELETE FROM public.attendance_records WHERE id = p_record_id;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (v_actor, 'ATTENDANCE_RECORD_DELETED', 'attendance_records', p_record_id::text,
            jsonb_build_object(
                'session_id', v_rec.session_id,
                'member_id', v_rec.member_id,
                'member_name', v_member.full_name,
                'member_number', v_member.member_number,
                'reason', COALESCE(btrim(p_reason), 'إلغاء تسجيل الحضور بواسطة القائد')
            ));

    RETURN jsonb_build_object('success', true, 'record_id', p_record_id);
END;
$$;

-- 4. Stored Functions for Member Lifecycle Management
-- ----------------------------------------------------------------------------

-- Toggle member active status (Deactivate / Reactivate)
CREATE OR REPLACE FUNCTION public.toggle_member_active(
    p_member_id uuid,
    p_is_active boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actor uuid := auth.uid();
    v_target public.profiles;
BEGIN
    IF v_actor IS NULL OR NOT public.is_admin(v_actor) THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;

    IF v_actor = p_member_id AND NOT p_is_active THEN
        RETURN jsonb_build_object('success', false, 'code', 'CANNOT_DEACTIVATE_SELF');
    END IF;

    SELECT * INTO v_target FROM public.profiles WHERE id = p_member_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'MEMBER_NOT_FOUND');
    END IF;

    -- Non-super-admins cannot alter super-admin status
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_member_id AND role = 'super_admin')
       AND NOT public.is_super_admin(v_actor) THEN
        RETURN jsonb_build_object('success', false, 'code', 'CANNOT_DEACTIVATE_SUPER_ADMIN');
    END IF;

    UPDATE public.profiles
    SET is_active = p_is_active, updated_at = now()
    WHERE id = p_member_id;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (v_actor,
            CASE WHEN p_is_active THEN 'MEMBER_REACTIVATED' ELSE 'MEMBER_DEACTIVATED' END,
            'profiles', p_member_id::text,
            jsonb_build_object(
                'member_name', v_target.full_name,
                'member_number', v_target.member_number,
                'is_active', p_is_active
            ));

    RETURN jsonb_build_object('success', true, 'member_id', p_member_id, 'is_active', p_is_active);
END;
$$;

-- Permanent member deletion (Super Admin only, transactional with safe FK cleanup)
CREATE OR REPLACE FUNCTION public.delete_member_permanent(
    p_member_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actor uuid := auth.uid();
    v_target public.profiles;
    v_name text;
    v_number text;
BEGIN
    IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;

    IF v_actor = p_member_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'CANNOT_DELETE_SELF');
    END IF;

    SELECT * INTO v_target FROM public.profiles WHERE id = p_member_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'MEMBER_NOT_FOUND');
    END IF;

    -- Cannot delete another super admin
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_member_id AND role = 'super_admin') THEN
        RETURN jsonb_build_object('success', false, 'code', 'CANNOT_DELETE_SUPER_ADMIN');
    END IF;

    v_name := v_target.full_name;
    v_number := v_target.member_number;

    -- 1. Safely nullify non-cascading foreign keys
    UPDATE public.team_distributions SET created_by = NULL WHERE created_by = p_member_id;
    UPDATE public.teams SET leader_id = NULL WHERE leader_id = p_member_id;
    UPDATE public.friday_sessions SET created_by = NULL WHERE created_by = p_member_id;
    UPDATE public.attendance_records SET recorded_by = v_actor WHERE recorded_by = p_member_id;
    UPDATE public.attendance_records SET edited_by = NULL WHERE edited_by = p_member_id;
    UPDATE public.member_achievements SET awarded_by = NULL WHERE awarded_by = p_member_id;
    UPDATE public.audit_logs SET actor_id = NULL WHERE actor_id = p_member_id;
    UPDATE public.staff_scope_assignments SET assigned_by = NULL WHERE assigned_by = p_member_id;

    -- 2. Delete cascading and child records
    DELETE FROM public.team_memberships WHERE member_id = p_member_id;
    DELETE FROM public.weekly_responses WHERE member_id = p_member_id;
    DELETE FROM public.attendance_records WHERE member_id = p_member_id;
    DELETE FROM public.qr_credentials WHERE member_id = p_member_id;
    DELETE FROM public.staff_scope_assignments WHERE user_id = p_member_id;
    DELETE FROM public.user_roles WHERE user_id = p_member_id;
    DELETE FROM public.member_achievements WHERE member_id = p_member_id;

    -- 3. Delete member profile
    DELETE FROM public.profiles WHERE id = p_member_id;

    -- 4. Audit trail
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (v_actor, 'MEMBER_PERMANENTLY_DELETED', 'profiles', p_member_id::text,
            jsonb_build_object('member_name', v_name, 'member_number', v_number));

    RETURN jsonb_build_object('success', true, 'deleted_member_id', p_member_id);
END;
$$;

-- Grant permissions to authenticated role
GRANT EXECUTE ON FUNCTION public.delete_attendance_record(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_member_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_member_permanent(uuid) TO authenticated;
