-- ==============================================================================
-- SCOUT HUB (كشافة هب) — Production Database Schema & RLS Policies
-- Migration 001: base schema. Run 002_production_hardening.sql right after it.
-- ==============================================================================

-- gen_random_uuid() is built into PostgreSQL 13+ (no extensions required).

-- ------------------------------------------------------------------------------
-- 1. STAGES (المراحل الكشفية)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stages (
    id TEXT PRIMARY KEY,
    name_ar TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    min_age INTEGER,
    max_age INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Default Scout Stages
INSERT INTO public.stages (id, name_ar, code, description, min_age, max_age)
VALUES 
    ('stage_1', 'المرحلة الأولى (الأشبال)', 'cubs', 'مرحلة الأشبال والزهرات', 7, 11),
    ('stage_2', 'المرحلة الثانية (الفتيان)', 'scouts', 'مرحلة الفتيان والمرشدات', 12, 14),
    ('stage_3', 'المرحلة الثالثة (المتقدم)', 'advanced', 'مرحلة المتقدم والرائدات', 15, 17)
ON CONFLICT (id) DO UPDATE SET 
    name_ar = EXCLUDED.name_ar,
    code = EXCLUDED.code;

-- ------------------------------------------------------------------------------
-- 2. PROFILES (ملفات الأعضاء والقادة)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    member_number TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    stage_id TEXT REFERENCES public.stages(id),
    initial_commitment TEXT NOT NULL CHECK (initial_commitment IN ('committed', 'inactive', 'circumstances')),
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_stage ON public.profiles(stage_id);
CREATE INDEX IF NOT EXISTS idx_profiles_member_number ON public.profiles(member_number);

-- ------------------------------------------------------------------------------
-- 3. USER ROLES (الأدوار والصلاحيات - RBAC)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'attendance_leader', 'member')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_role UNIQUE (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

-- Helper security functions (re-defined with a pinned search_path in migration 002)
CREATE OR REPLACE FUNCTION public.is_admin(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = check_user_id 
        AND role IN ('super_admin', 'admin')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_attendance_staff(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = check_user_id 
        AND role IN ('super_admin', 'admin', 'attendance_leader')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 4. QR CREDENTIALS (رموز وبطاقات الهوية المشفرة غير القابلة للتخمين)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.qr_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qr_credentials_member ON public.qr_credentials(member_id);
CREATE INDEX IF NOT EXISTS idx_qr_credentials_active ON public.qr_credentials(id) WHERE is_active = TRUE;

-- ------------------------------------------------------------------------------
-- 5. TEAM DISTRIBUTIONS & VERSIONS (محرك توزيع الفرق الكشفية)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_distributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('mixed_stages', 'separate_stages')),
    status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
    version_number INTEGER NOT NULL DEFAULT 1,
    random_seed TEXT NOT NULL,
    is_current_published BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_distributions_status ON public.team_distributions(status);
CREATE INDEX IF NOT EXISTS idx_team_distributions_current ON public.team_distributions(is_current_published) WHERE is_current_published = TRUE;

-- ------------------------------------------------------------------------------
-- 6. TEAMS (الفرق والطلائع الكشفية)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    distribution_id UUID NOT NULL REFERENCES public.team_distributions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    stage_id TEXT REFERENCES public.stages(id),
    leader_id UUID REFERENCES public.profiles(id),
    color_hex TEXT NOT NULL DEFAULT '#23836B',
    icon_name TEXT NOT NULL DEFAULT 'compass',
    total_points INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teams_distribution ON public.teams(distribution_id);

-- ------------------------------------------------------------------------------
-- 7. TEAM MEMBERSHIPS (عضويات الأعضاء في الفرق)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    is_leader BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_team_member UNIQUE (team_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_team_memberships_team ON public.team_memberships(team_id);
CREATE INDEX IF NOT EXISTS idx_team_memberships_member ON public.team_memberships(member_id);

-- ------------------------------------------------------------------------------
-- 8. FRIDAY SESSIONS (جلسات واجتماعات الجمعة الكشفية)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.friday_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_date DATE UNIQUE NOT NULL,
    title TEXT NOT NULL,
    start_time TIME NOT NULL DEFAULT '08:30:00',
    late_threshold_time TIME NOT NULL DEFAULT '08:45:00',
    is_open_for_attendance BOOLEAN NOT NULL DEFAULT FALSE,
    response_deadline TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_friday_sessions_date ON public.friday_sessions(session_date DESC);

-- ------------------------------------------------------------------------------
-- 9. WEEKLY RESPONSES (تأكيدات المشاركة الأسبوعية)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.weekly_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.friday_sessions(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    response TEXT NOT NULL CHECK (response IN ('attending', 'absent', 'circumstances')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_weekly_response UNIQUE (session_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_responses_session ON public.weekly_responses(session_id);

-- ------------------------------------------------------------------------------
-- 10. ATTENDANCE RECORDS (سجلات الحضور الفعلي والزي الكشفي)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.friday_sessions(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    qr_credential_id UUID REFERENCES public.qr_credentials(id),
    uniform_status TEXT NOT NULL CHECK (uniform_status IN ('with_uniform', 'without_uniform')),
    arrival_status TEXT NOT NULL CHECK (arrival_status IN ('on_time', 'late')),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_by UUID NOT NULL REFERENCES public.profiles(id),
    is_manual BOOLEAN NOT NULL DEFAULT FALSE,
    manual_reason TEXT,
    original_recorded_at TIMESTAMPTZ,
    edit_reason TEXT,
    edited_by UUID REFERENCES public.profiles(id),
    CONSTRAINT uq_session_attendance UNIQUE (session_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_session ON public.attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_member ON public.attendance_records(member_id);

-- ------------------------------------------------------------------------------
-- 11. GAMIFICATION & BADGES (الأوسمة والشارات الكشفية)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.achievement_definitions (
    id TEXT PRIMARY KEY,
    name_ar TEXT NOT NULL,
    description_ar TEXT NOT NULL,
    icon_name TEXT NOT NULL,
    badge_color TEXT NOT NULL DEFAULT '#E89B50',
    points INTEGER NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.achievement_definitions (id, name_ar, description_ar, icon_name, badge_color, points)
VALUES
    ('first_attendance', 'أول حضور', 'حضور أول اجتماع كشفي بنجاح', 'compass', '#23836B', 15),
    ('three_streak', '٣ جمع متتالية', 'حضور ثلاثة اجتماعات متتالية دون انقطاع', 'flame', '#E89B50', 30),
    ('uniform_champion', 'ملتزم بالزي', 'حضور بالزي الكشفي الكامل باستمرار', 'shirt', '#173C32', 25),
    ('early_bird', 'الحضور المبكر', 'الوصول قبل موعد الاجتماع بنشاط', 'clock', '#3B82F6', 20),
    ('active_scout', 'عضو نشيط ومميز', 'مشاركة وتفاعل إيجابي استثنائي', 'award', '#F59E0B', 40)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.member_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    achievement_id TEXT NOT NULL REFERENCES public.achievement_definitions(id) ON DELETE CASCADE,
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    awarded_by UUID REFERENCES public.profiles(id),
    CONSTRAINT uq_member_badge UNIQUE (member_id, achievement_id)
);

-- ------------------------------------------------------------------------------
-- 12. AUDIT LOGS (سجل التدقيق والتتبع للأحداث الحساسة)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);

-- ------------------------------------------------------------------------------
-- 13. ROW LEVEL SECURITY (RLS) POLICIES (several are tightened in migration 002)
-- ------------------------------------------------------------------------------
ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friday_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievement_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Stages: Readable by all authenticated users
CREATE POLICY "Allow authenticated read stages" ON public.stages
    FOR SELECT TO authenticated USING (true);

-- Profiles:
CREATE POLICY "Users read own profile" ON public.profiles
    FOR SELECT TO authenticated USING (auth.uid() = id OR public.is_attendance_staff(auth.uid()));

CREATE POLICY "Users insert own profile" ON public.profiles
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Users update own profile non-restricted" ON public.profiles
    FOR UPDATE TO authenticated USING (auth.uid() = id OR public.is_admin(auth.uid()));

-- User Roles:
CREATE POLICY "Admins read user roles" ON public.user_roles
    FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Super Admins manage roles" ON public.user_roles
    FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- QR Credentials:
CREATE POLICY "Member reads own active QR" ON public.qr_credentials
    FOR SELECT TO authenticated USING (
        (auth.uid() = member_id AND is_active = TRUE) OR public.is_attendance_staff(auth.uid())
    );

CREATE POLICY "Staff manages QR credentials" ON public.qr_credentials
    FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Team Distributions:
CREATE POLICY "Members see published distributions" ON public.team_distributions
    FOR SELECT TO authenticated USING (
        is_current_published = TRUE OR public.is_admin(auth.uid())
    );

CREATE POLICY "Admins manage distributions" ON public.team_distributions
    FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Teams:
CREATE POLICY "Members see published teams" ON public.teams
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.team_distributions td 
            WHERE td.id = teams.distribution_id AND (td.is_current_published = TRUE OR public.is_admin(auth.uid()))
        )
    );

CREATE POLICY "Admins manage teams" ON public.teams
    FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Team Memberships:
CREATE POLICY "Members see published memberships" ON public.team_memberships
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.teams t
            JOIN public.team_distributions td ON td.id = t.distribution_id
            WHERE t.id = team_memberships.team_id AND (td.is_current_published = TRUE OR public.is_admin(auth.uid()))
        )
    );

CREATE POLICY "Admins manage memberships" ON public.team_memberships
    FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Friday Sessions:
CREATE POLICY "All authenticated see sessions" ON public.friday_sessions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage sessions" ON public.friday_sessions
    FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Weekly Responses:
CREATE POLICY "Member reads own response or staff reads all" ON public.weekly_responses
    FOR SELECT TO authenticated USING (auth.uid() = member_id OR public.is_attendance_staff(auth.uid()));

CREATE POLICY "Member creates or updates own response" ON public.weekly_responses
    FOR ALL TO authenticated USING (auth.uid() = member_id);

-- Attendance Records:
CREATE POLICY "Member reads own attendance or staff reads all" ON public.attendance_records
    FOR SELECT TO authenticated USING (auth.uid() = member_id OR public.is_attendance_staff(auth.uid()));

CREATE POLICY "Staff inserts attendance" ON public.attendance_records
    FOR INSERT TO authenticated WITH CHECK (public.is_attendance_staff(auth.uid()));

CREATE POLICY "Admins update attendance" ON public.attendance_records
    FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

-- Achievements:
CREATE POLICY "Everyone reads achievement definitions" ON public.achievement_definitions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Everyone reads awarded badges" ON public.member_achievements
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff awards achievements" ON public.member_achievements
    FOR ALL TO authenticated USING (public.is_attendance_staff(auth.uid()));

-- Audit Logs:
CREATE POLICY "Only admins read audit logs" ON public.audit_logs
    FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
