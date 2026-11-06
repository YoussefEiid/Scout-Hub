import type { SupabaseClient } from '@supabase/supabase-js';
import { mapDbError, AppError } from '@/lib/actions/result';
import type {
  AttendanceRecord,
  FridaySession,
  MemberSummary,
  Profile,
  Team,
  TeamDistribution,
  UniformStatus,
  UserRoleType,
  WeeklyResponse,
  WeeklyResponseType,
  DistributionMode,
} from '@/types';

/**
 * Real database access (Supabase / PostgreSQL). Every function receives the per-request,
 * RLS-bound client; privileged writes happen inside SECURITY DEFINER functions defined in
 * supabase/migrations/002_production_hardening.sql, which re-check the caller's role in SQL.
 *
 * Nothing here logs credentials or QR tokens.
 */

async function callRpc<T>(client: SupabaseClient, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw mapDbError(error);
  return data as T;
}

const PROFILE_COLUMNS =
  'id, member_number, full_name, stage_id, initial_commitment, avatar_url, is_active, created_at, updated_at';

interface ProfileRow {
  id: string;
  member_number: string;
  full_name: string;
  stage_id: Profile['stage_id'];
  initial_commitment: Profile['initial_commitment'];
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_roles?: { role: UserRoleType }[];
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    member_number: row.member_number,
    full_name: row.full_name,
    stage_id: row.stage_id,
    initial_commitment: row.initial_commitment,
    avatar_url: row.avatar_url,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    roles: row.user_roles?.map((r) => r.role),
  };
}

// ---------------------------------------------------------------- identity & members

export async function getUserRoles(client: SupabaseClient, userId: string): Promise<UserRoleType[]> {
  const { data, error } = await client.from('user_roles').select('role').eq('user_id', userId);
  if (error) throw mapDbError(error);
  return (data ?? []).map((r: { role: UserRoleType }) => r.role);
}

/** Phone numbers are deliberately never selected: no screen needs them. */
export async function listMembers(client: SupabaseClient): Promise<Profile[]> {
  const { data, error } = await client
    .from('profiles')
    .select(`${PROFILE_COLUMNS}, user_roles(role)`)
    .order('created_at', { ascending: false });
  if (error) throw mapDbError(error);
  return ((data ?? []) as unknown as ProfileRow[]).map(toProfile);
}

export async function getProfile(client: SupabaseClient, id: string): Promise<Profile | null> {
  const { data, error } = await client
    .from('profiles')
    .select(`${PROFILE_COLUMNS}, user_roles(role)`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw mapDbError(error);
  return data ? toProfile(data as unknown as ProfileRow) : null;
}

// ---------------------------------------------------------------------------- QR

export async function getOrCreateMyQr(client: SupabaseClient): Promise<string> {
  return callRpc<string>(client, 'get_or_create_my_qr');
}

/** Returns the new token only when the caller rotates their OWN credential (admins get null). */
export async function rotateQr(client: SupabaseClient, memberId: string, reason: string): Promise<string | null> {
  return callRpc<string | null>(client, 'rotate_qr_credential', { p_member_id: memberId, p_reason: reason });
}

export interface QrVerification {
  status: 'valid' | 'invalid' | 'revoked' | 'inactive';
  member?: { id: string; full_name: string; member_number: string; stage_id: Profile['stage_id']; team_name: string | null };
}

export async function verifyQr(client: SupabaseClient, token: string): Promise<QrVerification> {
  return callRpc<QrVerification>(client, 'verify_qr_credential', { p_token: token });
}

// ------------------------------------------------------------------- attendance

export type AttendanceFailureCode =
  | 'INVALID_UNIFORM' | 'SESSION_NOT_FOUND' | 'SESSION_CLOSED' | 'INVALID_QR' | 'REVOKED_QR'
  | 'MEMBER_REQUIRED' | 'REASON_REQUIRED' | 'MEMBER_NOT_FOUND' | 'DUPLICATE' | 'RECORD_NOT_FOUND';

export type AttendanceRpcResult =
  | { success: true; record_id: string; arrival_status: 'on_time' | 'late'; recorded_at: string; member: { id: string; full_name: string; member_number: string } }
  | { success: false; code: AttendanceFailureCode };

export async function recordAttendance(
  client: SupabaseClient,
  params: { sessionId: string; uniform: UniformStatus; qrToken?: string | null; memberId?: string | null; manualReason?: string | null }
): Promise<AttendanceRpcResult> {
  return callRpc<AttendanceRpcResult>(client, 'record_attendance', {
    p_session_id: params.sessionId,
    p_uniform: params.uniform,
    p_qr_token: params.qrToken ?? null,
    p_member_id: params.memberId ?? null,
    p_manual_reason: params.manualReason ?? null,
  });
}

export async function correctAttendance(
  client: SupabaseClient,
  params: { recordId: string; newRecordedAt?: string | null; uniform?: UniformStatus | null; reason: string }
): Promise<{ success: boolean; code?: AttendanceFailureCode }> {
  return callRpc(client, 'correct_attendance', {
    p_record_id: params.recordId,
    p_new_recorded_at: params.newRecordedAt ?? null,
    p_uniform: params.uniform ?? null,
    p_reason: params.reason,
  });
}

interface AttendanceRow extends Omit<AttendanceRecord, 'member' | 'recorder'> {
  profiles: MemberSummary | null;
}

export async function listAttendance(client: SupabaseClient, sessionId: string): Promise<AttendanceRecord[]> {
  const { data, error } = await client
    .from('attendance_records')
    .select(
      'id, session_id, member_id, qr_credential_id, uniform_status, arrival_status, recorded_at, recorded_by, is_manual, manual_reason, original_recorded_at, edit_reason, edited_by, profiles:member_id(id, member_number, full_name, stage_id)'
    )
    .eq('session_id', sessionId)
    .order('recorded_at', { ascending: false });
  if (error) throw mapDbError(error);
  return ((data ?? []) as unknown as AttendanceRow[]).map(({ profiles, ...rest }) => ({
    ...rest,
    // Never expose the bearer credential id to the browser.
    qr_credential_id: null,
    member: profiles ?? undefined,
  }));
}

// -------------------------------------------------------------------- sessions

export async function listSessions(client: SupabaseClient): Promise<FridaySession[]> {
  const { data, error } = await client.from('friday_sessions').select('*').order('session_date', { ascending: false });
  if (error) throw mapDbError(error);
  return (data ?? []) as FridaySession[];
}

export async function createSession(
  client: SupabaseClient,
  input: { date: string; title: string; startTime: string; lateThresholdTime: string; notes?: string | null; actorId: string }
): Promise<FridaySession> {
  const { data, error } = await client
    .from('friday_sessions')
    .insert({
      session_date: input.date,
      title: input.title,
      start_time: input.startTime,
      late_threshold_time: input.lateThresholdTime,
      notes: input.notes ?? null,
      created_by: input.actorId,
    })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') throw new AppError('CONFLICT', 'يوجد اجتماع مسجل بالفعل في هذا التاريخ.');
    if (error.message.includes('chk_session_is_friday')) throw new AppError('VALIDATION', 'يجب أن يكون تاريخ الاجتماع يوم جمعة.');
    throw mapDbError(error);
  }
  return data as FridaySession;
}

export async function setSessionOpen(client: SupabaseClient, sessionId: string, open: boolean): Promise<void> {
  const { data, error } = await client
    .from('friday_sessions')
    .update({ is_open_for_attendance: open })
    .eq('id', sessionId)
    .select('id');
  if (error) throw mapDbError(error);
  if (!data || data.length === 0) throw new AppError('FORBIDDEN', 'تعذر تحديث حالة الاجتماع.');
}

export async function submitWeeklyResponse(
  client: SupabaseClient,
  sessionId: string,
  response: WeeklyResponseType
): Promise<{ success: boolean; code?: string }> {
  return callRpc(client, 'submit_weekly_response', { p_session_id: sessionId, p_response: response });
}

export async function getWeeklyResponse(client: SupabaseClient, sessionId: string, memberId: string): Promise<WeeklyResponse | null> {
  const { data, error } = await client
    .from('weekly_responses')
    .select('*')
    .eq('session_id', sessionId)
    .eq('member_id', memberId)
    .maybeSingle();
  if (error) throw mapDbError(error);
  return (data as WeeklyResponse | null) ?? null;
}

// ------------------------------------------------------------------------ teams

export interface DraftTeamInput {
  name: string;
  stage_id: string | null;
  color_hex: string;
  icon_name: string;
  leader_id: string | null;
  member_ids: string[];
}

export async function saveTeamDraft(
  client: SupabaseClient,
  params: { title: string; mode: DistributionMode; seed: string; teams: DraftTeamInput[] }
): Promise<string> {
  return callRpc<string>(client, 'save_team_distribution_draft', {
    p_title: params.title,
    p_mode: params.mode,
    p_seed: params.seed,
    p_teams: params.teams,
  });
}

export async function swapDraftMembers(client: SupabaseClient, distributionId: string, a: string, b: string): Promise<void> {
  await callRpc<null>(client, 'swap_draft_members', { p_distribution_id: distributionId, p_member_a: a, p_member_b: b });
}

export async function moveDraftMember(client: SupabaseClient, distributionId: string, memberId: string, toTeamId: string): Promise<void> {
  await callRpc<null>(client, 'move_draft_member', { p_distribution_id: distributionId, p_member_id: memberId, p_to_team_id: toTeamId });
}

export async function publishDistribution(client: SupabaseClient, distributionId: string): Promise<void> {
  await callRpc(client, 'publish_team_distribution', { p_distribution_id: distributionId });
}

export async function listDistributions(client: SupabaseClient): Promise<TeamDistribution[]> {
  const { data, error } = await client.from('team_distributions').select('*').order('created_at', { ascending: false });
  if (error) throw mapDbError(error);
  return (data ?? []) as TeamDistribution[];
}

interface DistributionDetailRow extends Omit<TeamDistribution, 'teams'> {
  teams: (Omit<Team, 'memberships'> & {
    team_memberships: { id: string; team_id: string; member_id: string; is_leader: boolean; created_at: string; profiles: MemberSummary | null }[];
  })[];
}

/** Admin-only (RLS): full roster of any distribution including drafts. */
export async function getDistributionDetail(client: SupabaseClient, id: string): Promise<TeamDistribution | null> {
  const { data, error } = await client
    .from('team_distributions')
    .select(
      '*, teams(id, distribution_id, name, stage_id, leader_id, color_hex, icon_name, total_points, created_at, team_memberships(id, team_id, member_id, is_leader, created_at, profiles:member_id(id, full_name, stage_id)))'
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw mapDbError(error);
  if (!data) return null;
  const row = data as unknown as DistributionDetailRow;
  return {
    ...row,
    teams: row.teams.map(({ team_memberships, ...team }) => ({
      ...team,
      member_count: team_memberships.length,
      memberships: team_memberships.map((m) => ({
        id: m.id,
        team_id: m.team_id,
        member_id: m.member_id,
        is_leader: m.is_leader,
        created_at: m.created_at,
        member: m.profiles ?? undefined,
      })),
    })),
  };
}

export interface MyTeamPayload {
  team: Pick<Team, 'id' | 'name' | 'stage_id' | 'leader_id' | 'color_hex' | 'icon_name' | 'total_points'>;
  members: { id: string; full_name: string; stage_id: Profile['stage_id']; is_leader: boolean }[];
}

export async function getMyPublishedTeam(client: SupabaseClient): Promise<Team | null> {
  const payload = await callRpc<MyTeamPayload | null>(client, 'get_my_published_team');
  if (!payload) return null;
  const now = new Date().toISOString();
  return {
    ...payload.team,
    distribution_id: '',
    created_at: now,
    member_count: payload.members.length,
    memberships: payload.members.map((m) => ({
      id: m.id,
      team_id: payload.team.id,
      member_id: m.id,
      is_leader: m.is_leader,
      created_at: now,
      member: {
        id: m.id,
        member_number: '',
        full_name: m.full_name,
        stage_id: m.stage_id,
        initial_commitment: 'committed',
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    })),
  };
}

// ---------------------------------------------------------------- member stats

export interface MemberStats {
  attended: number;
  withUniform: number;
  late: number;
}

export async function getMyStats(client: SupabaseClient, memberId: string): Promise<MemberStats> {
  const { data, error } = await client
    .from('attendance_records')
    .select('uniform_status, arrival_status')
    .eq('member_id', memberId);
  if (error) throw mapDbError(error);
  const rows = (data ?? []) as { uniform_status: string; arrival_status: string }[];
  return {
    attended: rows.length,
    withUniform: rows.filter((r) => r.uniform_status === 'with_uniform').length,
    late: rows.filter((r) => r.arrival_status === 'late').length,
  };
}

export interface BadgeSummary {
  id: string;
  name_ar: string;
  description_ar: string;
  points: number;
}

export async function getMyBadges(client: SupabaseClient, memberId: string): Promise<BadgeSummary[]> {
  const { data, error } = await client
    .from('member_achievements')
    .select('achievement_definitions(id, name_ar, description_ar, points)')
    .eq('member_id', memberId);
  if (error) throw mapDbError(error);
  const rows = (data ?? []) as unknown as { achievement_definitions: BadgeSummary | null }[];
  return rows.map((r) => r.achievement_definitions).filter((d): d is BadgeSummary => d !== null);
}

/**
 * Service object wrapper providing backward compatibility and architectural contract verification.
 */
export const SupabaseService = {
  getMembers: listMembers,
  getMemberById: getProfile,
  getMemberByQRToken: verifyQr,
  recordAttendance,
  publishTeamDistribution: publishDistribution,
  saveTeamDistributionDraft: saveTeamDraft,
  revokeAndIssueNewQRToken: rotateQr,
  getUserRole: getUserRoles,
  getFridaySessions: listSessions,
  getAttendanceRecords: listAttendance,
  submitWeeklyResponse,
  getActiveQRToken: getOrCreateMyQr,
  getCurrentPublishedDistribution: async (client: SupabaseClient) => {
    const dists = await listDistributions(client);
    const pub = dists.find((d) => d.is_current_published);
    if (!pub) return null;
    return getDistributionDetail(client, pub.id);
  },
};
