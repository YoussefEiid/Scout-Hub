export type ScoutStageId = 'stage_1' | 'stage_2' | 'stage_3';

export interface ScoutStage {
  id: ScoutStageId;
  name_ar: string;
  code: 'cubs' | 'scouts' | 'advanced';
  description?: string;
  min_age?: number;
  max_age?: number;
}

export type CommitmentPreference = 'committed' | 'inactive' | 'circumstances';

export type UserRoleType = 'super_admin' | 'admin' | 'attendance_leader' | 'member';

export interface MemberSummary {
  id: string;
  member_number: string;
  full_name: string;
  stage_id: ScoutStageId;
}

export interface Profile extends MemberSummary {
  phone?: string | null;
  initial_commitment: CommitmentPreference;
  avatar_url?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  stage?: ScoutStage;
  roles?: UserRoleType[];
  active_team?: Team | null;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: UserRoleType;
  created_at: string;
}

export interface QRCredential {
  id: string; // The secret unpredictable UUID token encoded in the QR code
  member_id: string;
  is_active: boolean;
  revoked_at?: string | null;
  revocation_reason?: string | null;
  created_at: string;
}

export type DistributionMode = 'mixed_stages' | 'separate_stages';
export type DistributionStatus = 'draft' | 'published' | 'archived';

export interface TeamDistribution {
  id: string;
  title: string;
  mode: DistributionMode;
  status: DistributionStatus;
  version_number: number;
  random_seed: string;
  is_current_published: boolean;
  published_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  teams?: Team[];
}

export interface Team {
  id: string;
  distribution_id: string;
  name: string;
  stage_id?: ScoutStageId | null;
  leader_id?: string | null;
  color_hex: string;
  icon_name: string;
  total_points: number;
  created_at: string;
  leader?: Profile | null;
  memberships?: TeamMembership[];
  member_count?: number;
}

export interface TeamMembership {
  id: string;
  team_id: string;
  member_id: string;
  is_leader: boolean;
  created_at: string;
  member?: Profile | MemberSummary;
}

export interface FridaySession {
  id: string;
  session_date: string; // YYYY-MM-DD
  title: string;
  start_time: string; // HH:MM:SS
  late_threshold_time: string; // HH:MM:SS
  is_open_for_attendance: boolean;
  response_deadline?: string | null;
  notes?: string | null;
  created_at: string;
  created_by?: string | null;
  stats?: {
    attending_count: number;
    absent_count: number;
    circumstances_count: number;
    actual_attendance_count: number;
    uniform_count: number;
  };
}

export type WeeklyResponseType = 'attending' | 'absent' | 'circumstances';

export interface WeeklyResponse {
  id: string;
  session_id: string;
  member_id: string;
  response: WeeklyResponseType;
  created_at: string;
  updated_at: string;
  member?: Profile;
}

export type UniformStatus = 'with_uniform' | 'without_uniform';
export type ArrivalStatus = 'on_time' | 'late';

export interface AttendanceRecord {
  id: string;
  session_id: string;
  member_id: string;
  qr_credential_id?: string | null;
  uniform_status: UniformStatus;
  arrival_status: ArrivalStatus;
  recorded_at: string;
  recorded_by: string;
  is_manual: boolean;
  manual_reason?: string | null;
  original_recorded_at?: string | null;
  edit_reason?: string | null;
  edited_by?: string | null;
  member?: Profile | MemberSummary;
  recorder?: Profile;
}

export interface AchievementDefinition {
  id: string;
  name_ar: string;
  description_ar: string;
  icon_name: string;
  badge_color: string;
  points: number;
}

export interface MemberAchievement {
  id: string;
  member_id: string;
  achievement_id: string;
  awarded_at: string;
  awarded_by?: string | null;
  definition?: AchievementDefinition;
}

export interface AuditLog {
  id: string;
  actor_id?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  details?: Record<string, unknown> | null;
  created_at: string;
}
