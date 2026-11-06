'use server';

import { AppError } from '@/lib/actions/result';
import {
  requireSession,
  hasRole,
  ADMIN_ROLES,
  STAFF_ROLES,
  ANY_ROLE,
} from '@/lib/auth/auth-service';
import { registerScoutMember, RegisterInput } from '@/lib/auth/registration';
import { ScoutStore } from '@/lib/data/scout-store';
import {
  listMembers,
  getProfile,
  getOrCreateMyQr,
  rotateQr,
  verifyQr,
  recordAttendance,
  listAttendance,
  listSessions,
  submitWeeklyResponse,
  getWeeklyResponse,
  saveTeamDraft,
  swapDraftMembers,
  publishDistribution,
  listDistributions,
  getDistributionDetail,
  getMyPublishedTeam,
  DraftTeamInput,
} from '@/lib/supabase/supabase-service';
import {
  generateMixedStageTeams,
  generateSeparateStageTeams,
} from '@/lib/teams/distribution-engine';
import type {
  AttendanceRecord,
  DistributionMode,
  Profile,
  ScoutStageId,
  Team,
  TeamDistribution,
  UniformStatus,
  WeeklyResponse,
  WeeklyResponseType,
} from '@/types';

/**
 * Server Action: Verify scanned QR bearer token.
 * Authoritative verification: restricted to Attendance Leaders & Administrators.
 */
export async function verifyScoutQRTokenAction(token: string) {
  if (!token) {
    return { member: null, isRevoked: false, isActive: false };
  }

  const ctx = await requireSession(STAFF_ROLES);

  if (ctx.mode === 'demo') {
    return ScoutStore.getMemberByQRToken(token);
  }

  const verification = await verifyQr(ctx.client!, token);

  if (verification.status === 'revoked') {
    return { member: null, isRevoked: true, isActive: false };
  }
  if (verification.status !== 'valid' || !verification.member) {
    return { member: null, isRevoked: false, isActive: false };
  }

  const memberProfile: Profile = {
    id: verification.member.id,
    member_number: verification.member.member_number,
    full_name: verification.member.full_name,
    stage_id: verification.member.stage_id,
    initial_commitment: 'committed',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return { member: memberProfile, isRevoked: false, isActive: true };
}

/**
 * Server Action: Record Friday attendance authoritatively.
 * Enforces staff/leader authorization and records server clock timestamp.
 */
export async function recordAttendanceAction(params: {
  sessionId: string;
  memberId: string;
  qrToken?: string | null;
  uniformStatus: UniformStatus;
  isManual?: boolean;
  manualReason?: string | null;
}) {
  const ctx = await requireSession(STAFF_ROLES);

  if (ctx.mode === 'demo') {
    const leaderId = ScoutStore.getAllMembers()[0]?.id || 'admin-system';
    return ScoutStore.recordAttendance({
      ...params,
      recordedBy: leaderId,
    });
  }

  const rpcRes = await recordAttendance(ctx.client!, {
    sessionId: params.sessionId,
    uniform: params.uniformStatus,
    qrToken: params.qrToken,
    memberId: params.memberId,
    manualReason: params.manualReason,
  });

  if (!rpcRes.success) {
    const errorMap: Record<string, string> = {
      SESSION_NOT_FOUND: 'جلسة الجمعة غير موجودة',
      SESSION_CLOSED: 'جلسة الجمعة مغلقة حاليًا لتسجيل الحضور',
      INVALID_QR: 'رمز QR غير صالح أو منتهي الصلاحية',
      REVOKED_QR: 'رمز QR تم إبطاله مسبقًا',
      MEMBER_REQUIRED: 'معرف الكشاف مطلوب',
      REASON_REQUIRED: 'سبب التسجيل اليدوي مطلوب عند عدم استخدام QR',
      MEMBER_NOT_FOUND: 'لم يتم العثور على سجل الكشاف أو حسابه غير نشط',
      DUPLICATE: 'تم تسجيل حضور هذا الكشاف بالفعل في هذا الاجتماع',
      INVALID_UNIFORM: 'حالة الزي الكشفي غير صالحة',
    };
    return {
      success: false,
      error: errorMap[rpcRes.code] || 'تعذر تسجيل الحضور، يرجى مراجعة البيانات',
    };
  }

  const record: AttendanceRecord = {
    id: rpcRes.record_id,
    session_id: params.sessionId,
    member_id: rpcRes.member.id,
    qr_credential_id: null,
    uniform_status: params.uniformStatus,
    arrival_status: rpcRes.arrival_status,
    recorded_at: rpcRes.recorded_at,
    recorded_by: ctx.userId,
    is_manual: Boolean(params.isManual),
    manual_reason: params.manualReason ?? null,
    member: {
      id: rpcRes.member.id,
      member_number: rpcRes.member.member_number,
      full_name: rpcRes.member.full_name,
      stage_id: 'stage_1',
      initial_commitment: 'committed',
      is_active: true,
      created_at: rpcRes.recorded_at,
      updated_at: rpcRes.recorded_at,
    },
  };

  return {
    success: true,
    record,
  };
}

/**
 * Server Action: Submit member weekly Friday RSVP intention.
 */
export async function submitWeeklyResponseAction(
  sessionId: string,
  memberId: string,
  response: WeeklyResponseType
) {
  const ctx = await requireSession(ANY_ROLE);

  if (ctx.mode !== 'demo' && ctx.userId !== memberId && !hasRole(ctx, ...ADMIN_ROLES)) {
    throw new AppError('FORBIDDEN', 'ليس لديك صلاحية لتسجيل الرد نيابة عن كشاف آخر.');
  }

  if (ctx.mode === 'demo') {
    return ScoutStore.submitWeeklyResponse(sessionId, memberId, response);
  }

  await submitWeeklyResponse(ctx.client!, sessionId, response);
  const now = new Date().toISOString();
  const updatedResponse: WeeklyResponse = {
    id: `resp-${Date.now()}`,
    session_id: sessionId,
    member_id: memberId,
    response,
    created_at: now,
    updated_at: now,
  };
  return updatedResponse;
}

/**
 * Server Action: Invalidate old token and issue fresh QR credential.
 */
export async function rotateMemberQRTokenAction(memberId: string) {
  const ctx = await requireSession(ANY_ROLE);

  if (ctx.mode !== 'demo' && ctx.userId !== memberId && !hasRole(ctx, ...ADMIN_ROLES)) {
    throw new AppError('FORBIDDEN', 'ليس لديك صلاحية لتجديد بطاقة كشاف آخر.');
  }

  if (ctx.mode === 'demo') {
    return ScoutStore.revokeAndIssueNewQRToken(memberId);
  }

  const newToken = await rotateQr(ctx.client!, memberId, 'تجديد يدوي');
  return newToken ?? '';
}

/**
 * Server Action: Register new scout member with compensating transaction.
 */
export async function registerMemberAction(data: RegisterInput) {
  return registerScoutMember(data);
}

/**
 * Server Action: Generate balanced teams (Mode A / Mode B).
 * Restricted to Administrators.
 */
export async function generateTeamDistributionAction(params: {
  title: string;
  mode: DistributionMode;
  mixedConfig?: { teamCount: number; teamNames?: string[] };
  separateConfig?: { stageTeamCounts: Record<ScoutStageId, number> };
  seed?: string;
}) {
  const ctx = await requireSession(ADMIN_ROLES);
  const seed = params.seed || Math.random().toString(36).substring(2, 9);

  if (ctx.mode === 'demo') {
    const allMembers = ScoutStore.getAllMembers().filter((m) => m.is_active);
    const distId = `dist-${Date.now()}`;
    let result;
    if (params.mode === 'mixed_stages') {
      result = generateMixedStageTeams(allMembers, {
        teamCount: params.mixedConfig?.teamCount || 4,
        teamNames: params.mixedConfig?.teamNames,
        seed,
      });
    } else {
      result = generateSeparateStageTeams(allMembers, {
        stageTeamCounts: params.separateConfig?.stageTeamCounts || {
          stage_1: 2,
          stage_2: 2,
          stage_3: 2,
        },
        seed,
      });
    }

    const teams: Team[] = result.teams.map((t, idx) => ({
      id: `team-${distId}-${idx + 1}`,
      distribution_id: distId,
      name: t.name,
      stage_id: t.stage_id,
      leader_id: t.leaderId,
      color_hex: t.color_hex,
      icon_name: t.icon_name,
      total_points: 0,
      created_at: new Date().toISOString(),
      member_count: t.members.length,
      memberships: t.members.map((m) => ({
        id: `mship-${distId}-${idx}-${m.id}`,
        team_id: `team-${distId}-${idx + 1}`,
        member_id: m.id,
        is_leader: m.id === t.leaderId,
        created_at: new Date().toISOString(),
        member: m,
      })),
    }));

    const draftDistribution: TeamDistribution = {
      id: distId,
      title: params.title || 'توزيع فرق جديد',
      mode: params.mode,
      status: 'draft',
      version_number: 1,
      random_seed: seed,
      is_current_published: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      teams,
    };

    ScoutStore.saveTeamDistributionDraft(draftDistribution);
    return draftDistribution;
  }

  // Supabase Mode
  const allMembers = (await listMembers(ctx.client!)).filter((m) => m.is_active);
  let result;
  if (params.mode === 'mixed_stages') {
    result = generateMixedStageTeams(allMembers, {
      teamCount: params.mixedConfig?.teamCount || 4,
      teamNames: params.mixedConfig?.teamNames,
      seed,
    });
  } else {
    result = generateSeparateStageTeams(allMembers, {
      stageTeamCounts: params.separateConfig?.stageTeamCounts || {
        stage_1: 2,
        stage_2: 2,
        stage_3: 2,
      },
      seed,
    });
  }

  const draftTeamsInput: DraftTeamInput[] = result.teams.map((t) => ({
    name: t.name,
    stage_id: t.stage_id || null,
    color_hex: t.color_hex,
    icon_name: t.icon_name,
    leader_id: t.leaderId || null,
    member_ids: t.members.map((m) => m.id),
  }));

  const distId = await saveTeamDraft(ctx.client!, {
    title: params.title || 'توزيع فرق جديد',
    mode: params.mode,
    seed,
    teams: draftTeamsInput,
  });

  const savedDetail = await getDistributionDetail(ctx.client!, distId);
  if (!savedDetail) {
    throw new AppError('INTERNAL', 'تعذر استرجاع مسودة الفرق بعد الحفظ.');
  }
  return savedDetail;
}

/**
 * Server Action: Atomically publish team distribution.
 * Restricted to Administrators.
 */
export async function publishTeamDistributionAction(distributionId: string) {
  const ctx = await requireSession(ADMIN_ROLES);

  if (ctx.mode === 'demo') {
    const success = ScoutStore.publishTeamDistribution(distributionId);
    if (!success) {
      throw new AppError('NOT_FOUND', 'تعذر نشر الفرق، يرجى التأكد من صحة معرف التوزيع');
    }
    return { success: true };
  }

  await publishDistribution(ctx.client!, distributionId);
  return { success: true };
}

/**
 * Server Action: Swap two members between teams in a draft.
 * Restricted to Administrators.
 */
export async function swapTeamMembersAction(params: {
  distributionId: string;
  teamAId: string;
  memberAId: string;
  teamBId: string;
  memberBId: string;
}) {
  const ctx = await requireSession(ADMIN_ROLES);

  if (ctx.mode === 'demo') {
    const dist = ScoutStore.getTeamDistributions().find((d) => d.id === params.distributionId);
    if (!dist || !dist.teams) throw new AppError('NOT_FOUND', 'توزيع الفرق غير موجود');

    const teamA = dist.teams.find((t) => t.id === params.teamAId);
    const teamB = dist.teams.find((t) => t.id === params.teamBId);
    if (!teamA || !teamB || !teamA.memberships || !teamB.memberships) {
      throw new AppError('NOT_FOUND', 'الفرق المحددة غير موجودة');
    }

    const idxA = teamA.memberships.findIndex((m) => m.member_id === params.memberAId);
    const idxB = teamB.memberships.findIndex((m) => m.member_id === params.memberBId);
    if (idxA === -1 || idxB === -1) throw new AppError('NOT_FOUND', 'أحد الأعضاء غير موجود في فريقه');

    const memberA = teamA.memberships[idxA].member!;
    const memberB = teamB.memberships[idxB].member!;

    teamA.memberships[idxA].member_id = memberB.id;
    teamA.memberships[idxA].member = memberB;
    if (teamA.leader_id === memberA.id) teamA.leader_id = memberB.id;

    teamB.memberships[idxB].member_id = memberA.id;
    teamB.memberships[idxB].member = memberA;
    if (teamB.leader_id === memberB.id) teamB.leader_id = memberA.id;

    ScoutStore.saveTeamDistributionDraft(dist);
    return { success: true, distribution: dist };
  }

  await swapDraftMembers(ctx.client!, params.distributionId, params.memberAId, params.memberBId);
  const updated = await getDistributionDetail(ctx.client!, params.distributionId);
  return { success: true, distribution: updated };
}

/**
 * Server Action: Export Friday attendance report formatted as CSV with UTF-8 BOM.
 * Restricted to Administrators.
 */
export async function exportAttendanceCSVAction(sessionId: string): Promise<string> {
  const ctx = await requireSession(ADMIN_ROLES);

  let records: AttendanceRecord[] = [];
  if (ctx.mode === 'demo') {
    records = ScoutStore.getAttendanceRecords(sessionId);
  } else {
    records = await listAttendance(ctx.client!, sessionId);
  }

  const header = [
    'رقم القيد',
    'اسم الكشاف',
    'المرحلة الكشفية',
    'الالتزام بالزي',
    'حالة الوصول',
    'توقيت الحضور',
    'طريقة التسجيل',
  ];

  const rows = records.map((r) => [
    r.member?.member_number || '',
    `"${r.member?.full_name || ''}"`,
    r.member?.stage_id === 'stage_1' ? 'أشبال' : r.member?.stage_id === 'stage_2' ? 'فتيان' : 'متقدم',
    r.uniform_status === 'with_uniform' ? 'بالزي الكامل' : 'بدون الزي',
    r.arrival_status === 'on_time' ? 'في الموعد' : 'متأخر',
    new Date(r.recorded_at).toLocaleTimeString('ar-EG'),
    r.is_manual ? 'يدوي' : 'مسح QR',
  ]);

  const bom = '\uFEFF';
  return bom + [header.join(','), ...rows.map((e) => e.join(','))].join('\n');
}

/**
 * Server Action: Load Member Dashboard Data.
 */
export async function getDashboardDataAction() {
  const ctx = await requireSession(ANY_ROLE);

  if (ctx.mode === 'demo') {
    const all = ScoutStore.getAllMembers();
    const member = all[0] || null;
    const activeSession = ScoutStore.getActiveFridaySession();
    const weeklyResponse =
      activeSession && member
        ? ScoutStore.getWeeklyResponseForMember(activeSession.id, member.id)
        : null;

    return {
      member,
      activeSession,
      weeklyResponse,
      isLiveSupabase: false,
    };
  }

  const member = await getProfile(ctx.client!, ctx.userId);
  if (!member) {
    throw new AppError('NOT_FOUND', 'لم يتم العثور على ملف الكشاف المرتبط بهذا الحساب.');
  }

  const sessions = await listSessions(ctx.client!);
  const activeSession = sessions.find((s) => s.is_open_for_attendance) || sessions[0] || null;

  let weeklyResponse = null;
  if (activeSession) {
    weeklyResponse = await getWeeklyResponse(ctx.client!, activeSession.id, member.id);
  }

  const myTeam = await getMyPublishedTeam(ctx.client!);
  if (myTeam) {
    member.active_team = myTeam;
  }

  return {
    member,
    activeSession,
    weeklyResponse,
    isLiveSupabase: true,
  };
}

/**
 * Server Action: Load Member Digital Card Data.
 */
export async function getMemberCardDataAction() {
  const ctx = await requireSession(ANY_ROLE);

  if (ctx.mode === 'demo') {
    const all = ScoutStore.getAllMembers();
    const member = all[0] || null;
    const qrToken = member ? ScoutStore.getActiveQRToken(member.id) : '';
    return { member, qrToken, isLiveSupabase: false };
  }

  const member = await getProfile(ctx.client!, ctx.userId);
  if (!member) {
    throw new AppError('NOT_FOUND', 'لم يتم العثور على ملف الكشاف المرتبط بهذا الحساب.');
  }

  const qrToken = await getOrCreateMyQr(ctx.client!);
  return { member, qrToken, isLiveSupabase: true };
}

/**
 * Server Action: Load Published Team Data for Member.
 */
export async function getMemberTeamDataAction() {
  const ctx = await requireSession(ANY_ROLE);

  if (ctx.mode === 'demo') {
    const all = ScoutStore.getAllMembers();
    const member = all[0] || null;
    const dist = ScoutStore.getCurrentPublishedDistribution();
    const team =
      dist && dist.teams && member
        ? dist.teams.find((t) => t.memberships?.some((m) => m.member_id === member.id)) || null
        : null;

    return { member, team, isLiveSupabase: false };
  }

  const member = await getProfile(ctx.client!, ctx.userId);
  if (!member) {
    throw new AppError('NOT_FOUND', 'لم يتم العثور على ملف الكشاف المرتبط بهذا الحساب.');
  }

  const team = await getMyPublishedTeam(ctx.client!);
  return { member, team, isLiveSupabase: true };
}

/**
 * Server Action: Load Admin Scanner Data.
 */
export async function getAdminScannerDataAction() {
  const ctx = await requireSession(STAFF_ROLES);

  if (ctx.mode === 'demo') {
    const activeSession = ScoutStore.getActiveFridaySession();
    const allMembers = ScoutStore.getAllMembers();
    const records = activeSession ? ScoutStore.getAttendanceRecords(activeSession.id) : [];

    return {
      activeSession,
      allMembers,
      attendanceCount: records.length,
      isLiveSupabase: false,
    };
  }

  const sessions = await listSessions(ctx.client!);
  const activeSession = sessions.find((s) => s.is_open_for_attendance) || sessions[0] || null;
  const members = await listMembers(ctx.client!);

  let count = 0;
  if (activeSession) {
    const records = await listAttendance(ctx.client!, activeSession.id);
    count = records.length;
  }

  return {
    activeSession,
    allMembers: members,
    attendanceCount: count,
    isLiveSupabase: true,
  };
}

/**
 * Server Action: Load Admin Team Distribution Data.
 */
export async function getAdminTeamsDataAction() {
  const ctx = await requireSession(ADMIN_ROLES);

  if (ctx.mode === 'demo') {
    const list = ScoutStore.getTeamDistributions();
    const pub = ScoutStore.getCurrentPublishedDistribution() || list[0] || null;

    return {
      distributions: list,
      activeDistribution: pub,
      isLiveSupabase: false,
    };
  }

  const dists = await listDistributions(ctx.client!);
  const publishedHeader = dists.find((d) => d.is_current_published) || dists[0] || null;
  let activeDistribution: TeamDistribution | null = null;
  if (publishedHeader) {
    activeDistribution = await getDistributionDetail(ctx.client!, publishedHeader.id);
  }

  return {
    distributions: dists,
    activeDistribution,
    isLiveSupabase: true,
  };
}

/**
 * Server Action: Load Admin Reports Data.
 */
export async function getAdminReportsDataAction(sessionId?: string) {
  const ctx = await requireSession(ADMIN_ROLES);

  if (ctx.mode === 'demo') {
    const sessions = ScoutStore.getFridaySessions();
    const targetId = sessionId || sessions[0]?.id || '';
    const records = targetId ? ScoutStore.getAttendanceRecords(targetId) : [];

    return {
      sessions,
      records,
      selectedSessionId: targetId,
      isLiveSupabase: false,
    };
  }

  const sessions = await listSessions(ctx.client!);
  const targetId = sessionId || sessions[0]?.id || '';
  const records = targetId ? await listAttendance(ctx.client!, targetId) : [];

  return {
    sessions,
    records,
    selectedSessionId: targetId,
    isLiveSupabase: true,
  };
}

/**
 * Server Action: Load Admin Members Data.
 */
export async function getAdminMembersDataAction() {
  const ctx = await requireSession(ADMIN_ROLES);

  if (ctx.mode === 'demo') {
    const members = ScoutStore.getAllMembers();
    return { members, isLiveSupabase: false };
  }

  const members = await listMembers(ctx.client!);
  return { members, isLiveSupabase: true };
}
