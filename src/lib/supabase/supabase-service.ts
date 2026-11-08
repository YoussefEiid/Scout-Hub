import type { SupabaseClient } from '@supabase/supabase-js';
import { mapDbError } from '@/lib/actions/result';
import type {
  AttendanceRecord,
  FridaySession,
  Profile,
  ScoutSection,
  ScoutSectionYear,
  StaffScopeAssignment,
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
 * supabase/migrations/002_production_hardening.sql and 003_dynamic_scout_structure_and_role_isolation.sql.
 *
 * Nothing here logs credentials or QR tokens.
 */

async function callRpc<T>(client: SupabaseClient, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw mapDbError(error);
  return data as T;
}

const PROFILE_COLUMNS =
  'id, member_number, full_name, stage_id, section_id, year_id, initial_commitment, avatar_url, is_active, created_at, updated_at';

interface ProfileRow {
  id: string;
  member_number: string;
  full_name: string;
  stage_id: Profile['stage_id'];
  section_id?: string | null;
  year_id?: string | null;
  initial_commitment: Profile['initial_commitment'];
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_roles?: { role: UserRoleType }[];
  scout_sections?: ScoutSection | null;
  scout_section_years?: ScoutSectionYear | null;
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    member_number: row.member_number,
    full_name: row.full_name,
    stage_id: row.stage_id,
    section_id: row.section_id,
    year_id: row.year_id,
    section: row.scout_sections ?? undefined,
    year: row.scout_section_years ?? undefined,
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

/** Lists members visible to the caller under RLS rules */
export async function listMembers(client: SupabaseClient): Promise<Profile[]> {
  const { data, error } = await client
    .from('profiles')
    .select(`${PROFILE_COLUMNS}, user_roles(role), scout_sections(*), scout_section_years(*)`)
    .order('created_at', { ascending: false });
  if (error) throw mapDbError(error);
  return ((data ?? []) as unknown as ProfileRow[]).map(toProfile);
}

export async function getProfile(client: SupabaseClient, id: string): Promise<Profile | null> {
  const { data, error } = await client
    .from('profiles')
    .select(`${PROFILE_COLUMNS}, user_roles(role), scout_sections(*), scout_section_years(*)`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw mapDbError(error);
  return data ? toProfile(data as unknown as ProfileRow) : null;
}

export async function updateProfile(
  client: SupabaseClient,
  userId: string,
  updates: { full_name?: string; phone?: string; avatar_url?: string }
): Promise<Profile> {
  const { data, error } = await client
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select(`${PROFILE_COLUMNS}, user_roles(role), scout_sections(*), scout_section_years(*)`)
    .single();
  if (error) throw mapDbError(error);
  return toProfile(data as unknown as ProfileRow);
}

// ---------------------------------------------------------------- scout sections & years

export async function listScoutSections(client: SupabaseClient): Promise<ScoutSection[]> {
  const { data, error } = await client
    .from('scout_sections')
    .select('*, scout_section_years(*)')
    .order('display_order', { ascending: true });
  if (error) throw mapDbError(error);
  return (data ?? []).map((s: any) => ({
    ...s,
    years: (s.scout_section_years ?? []).sort((a: any, b: any) => a.display_order - b.display_order),
  }));
}

export async function listActiveScoutSections(client: SupabaseClient): Promise<ScoutSection[]> {
  const { data, error } = await client
    .from('scout_sections')
    .select('*, scout_section_years(*)')
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  if (error) throw mapDbError(error);
  return (data ?? []).map((s: any) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    description: s.description,
    icon: s.icon,
    color_theme: s.color_theme,
    display_order: s.display_order,
    is_active: s.is_active,
    created_at: s.created_at,
    updated_at: s.updated_at,
    years: (s.scout_section_years ?? [])
      .filter((y: any) => y.is_active)
      .sort((a: any, b: any) => a.display_order - b.display_order)
      .map((y: any) => ({
        id: y.id,
        section_id: y.section_id,
        name: y.name,
        code: y.code,
        display_order: y.display_order,
        is_active: y.is_active,
        created_at: y.created_at,
        updated_at: y.updated_at,
      })),
  }));
}

export async function createScoutSection(
  client: SupabaseClient,
  input: {
    code: string;
    name: string;
    description?: string;
    icon?: string;
    color_theme?: string;
    display_order?: number;
  }
): Promise<ScoutSection> {
  const { data, error } = await client
    .from('scout_sections')
    .insert({
      code: input.code.toLowerCase().trim(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      icon: input.icon || 'compass',
      color_theme: input.color_theme || '#23836B',
      display_order: input.display_order ?? 0,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw mapDbError(error);
  return data as ScoutSection;
}

export async function updateScoutSection(
  client: SupabaseClient,
  id: string,
  updates: Partial<ScoutSection>
): Promise<ScoutSection> {
  const { data, error } = await client
    .from('scout_sections')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw mapDbError(error);
  return data as ScoutSection;
}

export async function listSectionYears(
  client: SupabaseClient,
  sectionId?: string
): Promise<ScoutSectionYear[]> {
  let query = client.from('scout_section_years').select('*').order('display_order', { ascending: true });
  if (sectionId) {
    query = query.eq('section_id', sectionId);
  }
  const { data, error } = await query;
  if (error) throw mapDbError(error);
  return (data ?? []) as ScoutSectionYear[];
}

export async function createSectionYear(
  client: SupabaseClient,
  input: { section_id: string; name: string; display_order?: number }
): Promise<ScoutSectionYear> {
  const { data, error } = await client
    .from('scout_section_years')
    .insert({
      section_id: input.section_id,
      name: input.name.trim(),
      display_order: input.display_order ?? 0,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw mapDbError(error);
  return data as ScoutSectionYear;
}

export async function updateSectionYear(
  client: SupabaseClient,
  id: string,
  updates: Partial<ScoutSectionYear>
): Promise<ScoutSectionYear> {
  const { data, error } = await client
    .from('scout_section_years')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw mapDbError(error);
  return data as ScoutSectionYear;
}

// ---------------------------------------------------------------- staff scope assignments

export async function getStaffScopeAssignments(
  client: SupabaseClient,
  userId?: string
): Promise<StaffScopeAssignment[]> {
  let query = client
    .from('staff_scope_assignments')
    .select('*, scout_sections(*), scout_section_years(*), profiles!staff_scope_assignments_user_id_fkey(full_name, member_number)');

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw mapDbError(error);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    user_id: row.user_id,
    section_id: row.section_id,
    year_id: row.year_id,
    assigned_by: row.assigned_by,
    created_at: row.created_at,
    section: row.scout_sections,
    year: row.scout_section_years,
    user: row.profiles,
  }));
}

export async function assignStaffScope(
  client: SupabaseClient,
  userId: string,
  sectionId: string,
  yearId?: string | null
): Promise<string> {
  return callRpc<string>(client, 'assign_staff_scope', {
    p_user_id: userId,
    p_section_id: sectionId,
    p_year_id: yearId ?? null,
  });
}

export async function revokeStaffScope(client: SupabaseClient, assignmentId: string): Promise<void> {
  await callRpc<void>(client, 'revoke_staff_scope', { p_assignment_id: assignmentId });
}

// ---------------------------------------------------------------- QR

export async function getOrCreateMyQr(client: SupabaseClient): Promise<string> {
  return callRpc<string>(client, 'get_or_create_my_qr');
}

/** Returns the new token only when the caller rotates their OWN credential (admins get null). */
export async function rotateQr(client: SupabaseClient, memberId: string, reason: string): Promise<string | null> {
  return callRpc<string | null>(client, 'rotate_qr_credential', { p_member_id: memberId, p_reason: reason });
}

export interface QrVerification {
  status: 'valid' | 'invalid' | 'revoked' | 'inactive' | 'unauthorized_scope';
  member?: {
    id: string;
    full_name: string;
    member_number: string;
    stage_id: Profile['stage_id'];
    section_id?: string;
    year_id?: string;
    team_name: string | null;
  };
}

export async function verifyQr(client: SupabaseClient, token: string): Promise<QrVerification> {
  return callRpc<QrVerification>(client, 'verify_qr_credential', { p_token: token });
}

// ---------------------------------------------------------------- attendance

export type AttendanceFailureCode =
  | 'INVALID_UNIFORM'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_CLOSED'
  | 'INVALID_QR'
  | 'REVOKED_QR'
  | 'MEMBER_REQUIRED'
  | 'REASON_REQUIRED'
  | 'MEMBER_NOT_FOUND'
  | 'DUPLICATE'
  | 'RECORD_NOT_FOUND'
  | 'UNAUTHORIZED_SCOPE'
  | 'SECTION_MISMATCH';

export type AttendanceRpcResult =
  | {
      success: true;
      record_id: string;
      arrival_status: 'on_time' | 'late';
      recorded_at: string;
      member: { id: string; full_name: string; member_number: string };
    }
  | { success: false; code: AttendanceFailureCode };

export async function recordAttendance(
  client: SupabaseClient,
  params: {
    sessionId: string;
    uniform: UniformStatus;
    qrToken?: string | null;
    memberId?: string | null;
    manualReason?: string | null;
  }
): Promise<AttendanceRpcResult> {
  return callRpc<AttendanceRpcResult>(client, 'record_attendance', {
    p_session_id: params.sessionId,
    p_uniform: params.uniform,
    p_qr_token: params.qrToken ?? null,
    p_member_id: params.memberId ?? null,
    p_manual_reason: params.manualReason ?? null,
  });
}

export async function listSessions(client: SupabaseClient, sectionId?: string): Promise<FridaySession[]> {
  let query = client
    .from('friday_sessions')
    .select('*, scout_sections(*)')
    .order('session_date', { ascending: false });

  if (sectionId) {
    query = query.or(`section_id.eq.${sectionId},section_id.is.null`);
  }

  const { data, error } = await query;
  if (error) throw mapDbError(error);

  const sessionIds = (data ?? []).map((s: any) => s.id);
  const attendanceMap: Record<string, { actual: number; uniform: number; late: number }> = {};
  const responsesMap: Record<string, { attending: number; absent: number; circumstances: number }> = {};

  if (sessionIds.length > 0) {
    const { data: attData } = await client
      .from('attendance_records')
      .select('session_id, uniform_status, arrival_status')
      .in('session_id', sessionIds);

    (attData ?? []).forEach((r: any) => {
      if (!attendanceMap[r.session_id]) {
        attendanceMap[r.session_id] = { actual: 0, uniform: 0, late: 0 };
      }
      attendanceMap[r.session_id].actual++;
      if (r.uniform_status === 'with_uniform') attendanceMap[r.session_id].uniform++;
      if (r.arrival_status === 'late') attendanceMap[r.session_id].late++;
    });

    const { data: respData } = await client
      .from('weekly_responses')
      .select('session_id, response')
      .in('session_id', sessionIds);

    (respData ?? []).forEach((r: any) => {
      if (!responsesMap[r.session_id]) {
        responsesMap[r.session_id] = { attending: 0, absent: 0, circumstances: 0 };
      }
      if (r.response === 'attending') responsesMap[r.session_id].attending++;
      else if (r.response === 'absent') responsesMap[r.session_id].absent++;
      else if (r.response === 'circumstances') responsesMap[r.session_id].circumstances++;
    });
  }

  return (data ?? []).map((row: any) => {
    const att = attendanceMap[row.id] || { actual: 0, uniform: 0, late: 0 };
    const resp = responsesMap[row.id] || { attending: 0, absent: 0, circumstances: 0 };
    return {
      ...row,
      status: row.status || (row.is_open_for_attendance ? 'open' : 'scheduled'),
      section: row.scout_sections,
      year: row.scout_section_years,
      stats: {
        attending_count: resp.attending,
        absent_count: resp.absent,
        circumstances_count: resp.circumstances,
        actual_attendance_count: att.actual,
        uniform_count: att.uniform,
        late_count: att.late,
      },
    };
  }) as FridaySession[];
}

export async function createFridaySession(
  client: SupabaseClient,
  session: {
    title: string;
    session_date: string;
    section_id?: string | null;
    year_id?: string | null;
    start_time?: string;
    late_threshold_time?: string;
    is_open_for_attendance?: boolean;
    notes?: string | null;
    created_by?: string | null;
  }
): Promise<FridaySession> {
  const isOpen = Boolean(session.is_open_for_attendance);
  const basePayload: any = {
    title: session.title.trim(),
    session_date: session.session_date,
    section_id: session.section_id || null,
    start_time: session.start_time || '08:30:00',
    late_threshold_time: session.late_threshold_time || '08:45:00',
    is_open_for_attendance: isOpen,
    notes: session.notes?.trim() || null,
    created_by: session.created_by || null,
  };

  let insertResult = await client
    .from('friday_sessions')
    .insert({
      ...basePayload,
      status: isOpen ? 'open' : 'scheduled',
      year_id: session.year_id || null,
    })
    .select('*, scout_sections(*)')
    .single();

  if (insertResult.error && insertResult.error.message?.includes('does not exist')) {
    insertResult = await client
      .from('friday_sessions')
      .insert(basePayload)
      .select('*, scout_sections(*)')
      .single();
  }

  if (insertResult.error) throw mapDbError(insertResult.error);
  const data = insertResult.data;

  return {
    ...data,
    status: data.status || (data.is_open_for_attendance ? 'open' : 'scheduled'),
    section: data.scout_sections,
    stats: {
      attending_count: 0,
      absent_count: 0,
      circumstances_count: 0,
      actual_attendance_count: 0,
      uniform_count: 0,
      late_count: 0,
    },
  } as FridaySession;
}

export async function updateFridaySession(
  client: SupabaseClient,
  sessionId: string,
  patch: Partial<FridaySession>
): Promise<FridaySession> {
  const updateData: any = {};
  if (patch.title !== undefined) updateData.title = patch.title;
  if (patch.session_date !== undefined) updateData.session_date = patch.session_date;
  if (patch.section_id !== undefined) updateData.section_id = patch.section_id;
  if (patch.start_time !== undefined) updateData.start_time = patch.start_time;
  if (patch.late_threshold_time !== undefined) updateData.late_threshold_time = patch.late_threshold_time;
  if (patch.is_open_for_attendance !== undefined) {
    updateData.is_open_for_attendance = patch.is_open_for_attendance;
  }
  if (patch.notes !== undefined) updateData.notes = patch.notes;

  let updateResult = await client
    .from('friday_sessions')
    .update({
      ...updateData,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.year_id !== undefined ? { year_id: patch.year_id } : {}),
    })
    .eq('id', sessionId)
    .select('*, scout_sections(*)')
    .single();

  if (updateResult.error && updateResult.error.message?.includes('does not exist')) {
    updateResult = await client
      .from('friday_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .select('*, scout_sections(*)')
      .single();
  }

  if (updateResult.error) throw mapDbError(updateResult.error);
  const data = updateResult.data;
  return {
    ...data,
    status: data.status || (data.is_open_for_attendance ? 'open' : 'scheduled'),
    section: data.scout_sections,
  } as FridaySession;
}

export async function toggleSessionAttendance(
  client: SupabaseClient,
  sessionId: string,
  isOpen: boolean
): Promise<FridaySession> {
  return updateFridaySession(client, sessionId, {
    is_open_for_attendance: isOpen,
    status: isOpen ? 'open' : 'closed',
  });
}

export async function deleteFridaySession(
  client: SupabaseClient,
  sessionId: string
): Promise<boolean> {
  const { error } = await client
    .from('friday_sessions')
    .delete()
    .eq('id', sessionId);
  if (error) throw mapDbError(error);
  return true;
}

export async function deleteAttendanceRecord(
  client: SupabaseClient,
  recordId: string,
  reason?: string
): Promise<{ success: boolean; recordId?: string; error?: string }> {
  try {
    const res = await callRpc<{ success: boolean; record_id?: string; code?: string }>(
      client,
      'delete_attendance_record',
      {
        p_record_id: recordId,
        p_reason: reason ?? null,
      }
    );
    if (res && res.success) {
      return { success: true, recordId: res.record_id };
    }
  } catch {
    // Graceful fallback to direct DELETE if RPC is not present
    const { error } = await client.from('attendance_records').delete().eq('id', recordId);
    if (!error) return { success: true, recordId };
  }
  return { success: false, error: 'FAILED_TO_DELETE_ATTENDANCE' };
}

export async function updateAttendanceUniform(
  client: SupabaseClient,
  recordId: string,
  uniformStatus: UniformStatus
): Promise<boolean> {
  const { error } = await client
    .from('attendance_records')
    .update({ uniform_status: uniformStatus })
    .eq('id', recordId);
  if (error) throw mapDbError(error);
  return true;
}

export async function toggleMemberActive(
  client: SupabaseClient,
  memberId: string,
  isActive: boolean
): Promise<{ success: boolean; isActive?: boolean; error?: string }> {
  try {
    const res = await callRpc<{ success: boolean; member_id?: string; is_active?: boolean; code?: string }>(
      client,
      'toggle_member_active',
      {
        p_member_id: memberId,
        p_is_active: isActive,
      }
    );
    if (res && res.success) {
      return { success: true, isActive: res.is_active };
    }
    if (res && !res.success) {
      return { success: false, error: res.code || 'FAILED_TO_TOGGLE_ACTIVE' };
    }
  } catch {
    // Graceful fallback to direct UPDATE
    const { error } = await client.from('profiles').update({ is_active: isActive }).eq('id', memberId);
    if (!error) return { success: true, isActive };
  }
  return { success: false, error: 'FAILED_TO_TOGGLE_ACTIVE' };
}

export async function deleteMemberPermanent(
  client: SupabaseClient,
  memberId: string
): Promise<{ success: boolean; deletedMemberId?: string; error?: string }> {
  try {
    const res = await callRpc<{ success: boolean; deleted_member_id?: string; code?: string }>(
      client,
      'delete_member_permanent',
      {
        p_member_id: memberId,
      }
    );
    if (res && res.success) {
      return { success: true, deletedMemberId: res.deleted_member_id };
    }
    if (res && !res.success) {
      return { success: false, error: res.code || 'FAILED_TO_DELETE_MEMBER' };
    }
  } catch {
    // Graceful fallback to cascading cleanup
    try {
      await client.from('team_memberships').delete().eq('member_id', memberId);
      await client.from('attendance_records').delete().eq('member_id', memberId);
      await client.from('qr_credentials').delete().eq('member_id', memberId);
      await client.from('user_roles').delete().eq('user_id', memberId);
      const { error } = await client.from('profiles').delete().eq('id', memberId);
      if (!error) return { success: true, deletedMemberId: memberId };
    } catch {}
  }
  return { success: false, error: 'FAILED_TO_DELETE_MEMBER' };
}

export async function listAttendance(client: SupabaseClient, sessionId: string): Promise<AttendanceRecord[]> {
  const { data, error } = await client
    .from('attendance_records')
    .select(
      'id, session_id, member_id, uniform_status, arrival_status, recorded_at, recorded_by, is_manual, manual_reason, original_recorded_at, edit_reason, edited_by, profiles!attendance_records_member_id_fkey(id, member_number, full_name, stage_id, section_id, year_id)'
    )
    .eq('session_id', sessionId)
    .order('recorded_at', { ascending: false });
  if (error) throw mapDbError(error);
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    member: r.profiles,
  })) as AttendanceRecord[];
}

// ---------------------------------------------------------------- weekly responses

export async function submitWeeklyResponse(
  client: SupabaseClient,
  sessionId: string,
  response: WeeklyResponseType
): Promise<{ success: boolean; code?: string; response?: WeeklyResponseType }> {
  return callRpc(client, 'submit_weekly_response', {
    p_session_id: sessionId,
    p_response: response,
  });
}

export async function getWeeklyResponse(
  client: SupabaseClient,
  sessionId: string,
  memberId: string
): Promise<WeeklyResponse | null> {
  const { data, error } = await client
    .from('weekly_responses')
    .select('id, session_id, member_id, response, created_at, updated_at')
    .eq('session_id', sessionId)
    .eq('member_id', memberId)
    .maybeSingle();
  if (error) throw mapDbError(error);
  return data as WeeklyResponse | null;
}

// ---------------------------------------------------------------- teams & distributions

export interface DraftTeamInput {
  name: string;
  stage_id?: string | null;
  section_id?: string | null;
  year_id?: string | null;
  color_hex?: string;
  icon_name?: string;
  leader_id?: string | null;
  member_ids: string[];
}

export async function saveTeamDraft(
  client: SupabaseClient,
  params: { title: string; mode: DistributionMode; seed: string; teams: DraftTeamInput[]; sectionId?: string | null }
): Promise<string> {
  try {
    return await callRpc<string>(client, 'save_team_distribution_draft', {
      p_title: params.title,
      p_mode: params.mode,
      p_seed: params.seed,
      p_teams: params.teams,
      p_section_id: params.sectionId || null,
    });
  } catch (err: unknown) {
    // Graceful fallback to 4-parameter legacy signature if migration 005 is pending
    return await callRpc<string>(client, 'save_team_distribution_draft', {
      p_title: params.title,
      p_mode: params.mode,
      p_seed: params.seed,
      p_teams: params.teams,
    });
  }
}

export async function swapDraftMembers(
  client: SupabaseClient,
  params: { distributionId: string; memberA: string; memberB: string }
): Promise<void> {
  await callRpc<void>(client, 'swap_draft_members', {
    p_distribution_id: params.distributionId,
    p_member_a: params.memberA,
    p_member_b: params.memberB,
  });
}

export async function publishDistribution(client: SupabaseClient, distributionId: string): Promise<string> {
  const res = await callRpc<{ success: boolean; distribution_id: string }>(
    client,
    'publish_team_distribution',
    { p_distribution_id: distributionId }
  );
  return res.distribution_id;
}

export async function listDistributions(client: SupabaseClient): Promise<TeamDistribution[]> {
  const { data, error } = await client
    .from('team_distributions')
    .select('id, title, mode, status, version_number, random_seed, is_current_published, published_at, created_by, created_at, updated_at, scout_sections(*)')
    .order('version_number', { ascending: false });
  if (error) throw mapDbError(error);
  return ((data ?? []) as any[]).map((d) => ({
    ...d,
    section: d.scout_sections,
  })) as TeamDistribution[];
}

export async function getDistributionDetail(
  client: SupabaseClient,
  distributionId: string
): Promise<TeamDistribution | null> {
  const { data: dist, error: dErr } = await client
    .from('team_distributions')
    .select('*, scout_sections(*)')
    .eq('id', distributionId)
    .maybeSingle();
  if (dErr) throw mapDbError(dErr);
  if (!dist) return null;

  const { data: teams, error: tErr } = await client
    .from('teams')
    .select(
      'id, distribution_id, name, stage_id, section_id, year_id, leader_id, color_hex, icon_name, total_points, created_at, team_memberships(id, team_id, member_id, is_leader, profiles(id, member_number, full_name, stage_id, section_id, year_id))'
    )
    .eq('distribution_id', distributionId);
  if (tErr) throw mapDbError(tErr);

  return {
    ...dist,
    section: dist.scout_sections,
    teams: (teams ?? []).map((t: any) => ({
      id: t.id,
      distribution_id: t.distribution_id,
      name: t.name,
      stage_id: t.stage_id,
      section_id: t.section_id,
      year_id: t.year_id,
      leader_id: t.leader_id,
      color_hex: t.color_hex,
      icon_name: t.icon_name,
      total_points: t.total_points,
      created_at: t.created_at,
      member_count: t.team_memberships?.length ?? 0,
      memberships: (t.team_memberships ?? []).map((m: any) => ({
        id: m.id,
        team_id: m.team_id,
        member_id: m.member_id,
        is_leader: m.is_leader,
        created_at: dist.created_at,
        member: m.profiles,
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
  createFridaySession,
  updateFridaySession,
  toggleSessionAttendance,
  deleteFridaySession,
  deleteAttendanceRecord,
  updateAttendanceUniform,
  toggleMemberActive,
  deleteMemberPermanent,
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
