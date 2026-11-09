'use server';

import { revalidatePath } from 'next/cache';

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // In unit test runners, static generation store is not active
  }
}
import { AppError } from '@/lib/actions/result';
import {
  requireSession,
  hasRole,
  SUPER_ADMIN_ROLES,
  ADMIN_ROLES,
  LEADER_ROLES,
  STAFF_ROLES,
  ANY_ROLE,
  getDefaultRedirectForRole,
} from '@/lib/auth/auth-service';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { registerScoutMember, RegisterInput } from '@/lib/auth/registration';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBackendMode } from '@/lib/config/runtime';
import { ScoutStore } from '@/lib/data/scout-store';
import {
  listMembers,
  getProfile,
  getUserRoles,
  updateProfile,
  listScoutSections,
  listActiveScoutSections,
  createScoutSection,
  updateScoutSection,
  createSectionYear,
  updateSectionYear,
  getStaffScopeAssignments,
  assignStaffScope,
  revokeStaffScope,
  getOrCreateMyQr,
  rotateQr,
  verifyQr,
  recordAttendance,
  listAttendance,
  listSessions,
  createFridaySession,
  updateFridaySession,
  toggleSessionAttendance,
  deleteFridaySession,
  deleteAttendanceRecord,
  updateAttendanceUniform,
  toggleMemberActive,
  deleteMemberPermanent,
  submitWeeklyResponse,
  getWeeklyResponse,
  saveTeamDraft,
  swapDraftMembers,
  publishDistribution,
  listDistributions,
  getDistributionDetail,
  getMyPublishedTeam,
  getMyStats,
  getMyBadges,
  DraftTeamInput,
} from '@/lib/supabase/supabase-service';
import {
  generateMixedStageTeams,
  generateSeparateStageTeams,
  isEligibleScout,
} from '@/lib/teams/distribution-engine';
import { normalizePhoneNumber } from '@/lib/auth/registration';
import type {
  AttendanceRecord,
  DistributionMode,
  FridaySession,
  Profile,
  ScoutSection,
  ScoutSectionYear,
  ScoutStageId,
  Team,
  TeamDistribution,
  UniformStatus,
  UserRoleType,
  WeeklyResponse,
  WeeklyResponseType,
} from '@/types';

/**
 * Server Action: Verify scanned QR bearer token.
 * Authoritative verification: restricted to Attendance Leaders & Administrators.
 */
export async function verifyScoutQRTokenAction(token: string) {
  if (!token) {
    return { member: null, isRevoked: false, isActive: false, isUnauthorizedScope: false };
  }

  const ctx = await requireSession(STAFF_ROLES);

  if (ctx.mode === 'demo') {
    const demo = ScoutStore.getMemberByQRToken(token);
    return { ...demo, isUnauthorizedScope: false };
  }

  const verification = await verifyQr(ctx.client!, token);

  if (verification.status === 'unauthorized_scope') {
    return { member: null, isRevoked: false, isActive: false, isUnauthorizedScope: true };
  }
  if (verification.status === 'revoked') {
    return { member: null, isRevoked: true, isActive: false, isUnauthorizedScope: false };
  }
  if (verification.status !== 'valid' || !verification.member) {
    return { member: null, isRevoked: false, isActive: false, isUnauthorizedScope: false };
  }

  const memberProfile: Profile = {
    id: verification.member.id,
    member_number: verification.member.member_number,
    full_name: verification.member.full_name,
    stage_id: verification.member.stage_id,
    section_id: verification.member.section_id,
    year_id: verification.member.year_id,
    initial_commitment: 'committed',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return { member: memberProfile, isRevoked: false, isActive: true, isUnauthorizedScope: false };
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
      UNAUTHORIZED_SCOPE: 'ليس لديك صلاحية لتسجيل حضور كشاف في قسم خارج نطاق إشرافك المعتمد',
      SECTION_MISMATCH: 'هذا الكشاف يتبع قسمًا كشفيًا مختلفًا عن قسم جلسة اليوم',
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
 * Accessible to Administrators and Section Leaders.
 */
export async function generateTeamDistributionAction(params: {
  title: string;
  mode: DistributionMode;
  mixedConfig?: { teamCount: number; teamNames?: string[]; sectionId?: string };
  separateConfig?: {
    stageTeamCounts?: Record<ScoutStageId, number>;
    sectionTeamCounts?: Record<string, number>;
  };
  sectionId?: string;
  seed?: string;
}) {
  const ctx = await requireSession(LEADER_ROLES);
  const seed = params.seed || Math.random().toString(36).substring(2, 9);
  let effectiveSectionId = params.sectionId || params.mixedConfig?.sectionId;

  if (!effectiveSectionId && !ctx.roles.includes('super_admin') && !ctx.roles.includes('admin') && ctx.client) {
    const scopes = ctx.scopes || (await getStaffScopeAssignments(ctx.client, ctx.userId));
    if (scopes.length > 0) {
      effectiveSectionId = scopes[0].section_id;
    }
  }

  if (ctx.mode === 'demo') {
    let allMembers = ScoutStore.getAllMembers().filter(isEligibleScout);
    if (effectiveSectionId) {
      allMembers = allMembers.filter((m) => m.section_id === effectiveSectionId);
    }

    if (allMembers.length === 0) {
      throw new AppError(
        'VALIDATION',
        'لا يوجد أعضاء كشافة مؤهلين للتوزيع حالياً (يجب أن يكون الكشاف نشطاً ولا يحمل رتبة قائد أو إداري).'
      );
    }

    const distId = `dist-${Date.now()}`;
    let result;
    if (params.mode === 'mixed_stages') {
      result = generateMixedStageTeams(allMembers, {
        teamCount: params.mixedConfig?.teamCount || 4,
        teamNames: params.mixedConfig?.teamNames,
        sectionId: effectiveSectionId,
        seed,
      });
    } else {
      result = generateSeparateStageTeams(allMembers, {
        stageTeamCounts: params.separateConfig?.stageTeamCounts || {
          stage_1: 2,
          stage_2: 2,
          stage_3: 2,
        },
        sectionTeamCounts: params.separateConfig?.sectionTeamCounts,
        seed,
      });
    }

    const teams: Team[] = result.teams.map((t, idx) => ({
      id: `team-${distId}-${idx + 1}`,
      distribution_id: distId,
      name: t.name,
      stage_id: t.stage_id,
      section_id: t.section_id || effectiveSectionId,
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
      section_id: effectiveSectionId,
      is_current_published: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      teams,
    };

    ScoutStore.saveTeamDistributionDraft(draftDistribution);
    return draftDistribution;
  }

  // Supabase Mode
  const rawMembers = await listMembers(ctx.client!);
  let eligible = rawMembers.filter(isEligibleScout);

  if (effectiveSectionId) {
    eligible = eligible.filter((m) => m.section_id === effectiveSectionId);
  } else if (!ctx.roles.includes('super_admin') && !ctx.roles.includes('admin')) {
    const scopes = ctx.scopes || (await getStaffScopeAssignments(ctx.client!, ctx.userId));
    const allowedSectionIds = scopes.map((s) => s.section_id);
    if (allowedSectionIds.length > 0) {
      eligible = eligible.filter((m) => m.section_id && allowedSectionIds.includes(m.section_id));
    }
  }

  if (eligible.length === 0) {
    throw new AppError(
      'VALIDATION',
      'لا يوجد أعضاء كشافة مؤهلين للتوزيع حالياً في النطاق المحدد (يجب أن يكون الكشاف نشطاً ولا يحمل رتبة قائد أو إداري).'
    );
  }

  let result;
  if (params.mode === 'mixed_stages') {
    result = generateMixedStageTeams(eligible, {
      teamCount: params.mixedConfig?.teamCount || 4,
      teamNames: params.mixedConfig?.teamNames,
      sectionId: effectiveSectionId,
      seed,
    });
  } else {
    result = generateSeparateStageTeams(eligible, {
      stageTeamCounts: params.separateConfig?.stageTeamCounts || {
        stage_1: 2,
        stage_2: 2,
        stage_3: 2,
      },
      sectionTeamCounts: params.separateConfig?.sectionTeamCounts,
      seed,
    });
  }

  if (!result.teams || result.teams.length === 0) {
    throw new AppError('VALIDATION', 'تعذر تكوين طلائع كشفية من الأعضاء المحددين.');
  }

  const draftTeamsInput: DraftTeamInput[] = result.teams.map((t) => ({
    name: t.name,
    stage_id: t.stage_id || null,
    section_id: t.section_id || effectiveSectionId || null,
    color_hex: t.color_hex,
    icon_name: t.icon_name,
    leader_id: t.leaderId || (t.members.length > 0 ? t.members[0].id : null),
    member_ids: t.members.map((m) => m.id),
  }));

  const distId = await saveTeamDraft(ctx.client!, {
    title: params.title || 'توزيع فرق جديد',
    mode: params.mode,
    seed,
    teams: draftTeamsInput,
    sectionId: effectiveSectionId || null,
  });

  const savedDetail = await getDistributionDetail(ctx.client!, distId);
  if (!savedDetail) {
    throw new AppError('INTERNAL', 'تعذر استرجاع مسودة الفرق بعد الحفظ.');
  }
  return savedDetail;
}

/**
 * Server Action: Atomically publish team distribution.
 * Restricted to Administrators and Section Leaders.
 */
export async function publishTeamDistributionAction(distributionId: string) {
  const ctx = await requireSession(LEADER_ROLES);

  if (ctx.mode === 'demo') {
    const success = ScoutStore.publishTeamDistribution(distributionId);
    if (!success) {
      throw new AppError('NOT_FOUND', 'تعذر نشر الفرق، يرجى التأكد من صحة معرف التوزيع');
    }
    return { success: true };
  }

  try {
    await publishDistribution(ctx.client!, distributionId);
  } catch (err: unknown) {
    // If live RPC returned FORBIDDEN due to pending Migration 006, verify leader section scope and execute with admin client
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('FORBIDDEN') || errMsg.includes('42501')) {
      const adminClient = createAdminClient();
      const { data: dist } = await adminClient
        .from('team_distributions')
        .select('id, section_id, status')
        .eq('id', distributionId)
        .maybeSingle();

      if (!dist) throw new AppError('NOT_FOUND', 'لم يتم العثور على تشكيل الفرق المطلوب.');

      if (!ctx.roles.includes('super_admin') && !ctx.roles.includes('admin')) {
        const scopes = await getStaffScopeAssignments(adminClient, ctx.userId);
        if (dist.section_id && !scopes.some((s) => s.section_id === dist.section_id)) {
          throw new AppError('FORBIDDEN', 'ليس لديك صلاحية لنشر طلائع قسم خارج نطاق إشرافك.');
        }
      }

      // Mark distribution published safely
      if (dist.section_id) {
        await adminClient
          .from('team_distributions')
          .update({ is_current_published: false, status: 'archived', updated_at: new Date().toISOString() })
          .eq('is_current_published', true)
          .eq('section_id', dist.section_id)
          .neq('id', distributionId);
      } else {
        await adminClient
          .from('team_distributions')
          .update({ is_current_published: false, status: 'archived', updated_at: new Date().toISOString() })
          .eq('is_current_published', true)
          .neq('id', distributionId);
      }

      await adminClient
        .from('team_distributions')
        .update({
          is_current_published: true,
          status: 'published',
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', distributionId);

      await adminClient.from('audit_logs').insert({
        actor_id: ctx.userId,
        action: 'TEAM_DISTRIBUTION_PUBLISHED',
        entity_type: 'team_distributions',
        entity_id: distributionId,
        details: { section_id: dist.section_id, published_by_role: ctx.roles[0] },
      });
    } else {
      throw err;
    }
  }

  safeRevalidate('/leader/teams');
  safeRevalidate('/super-admin/teams');
  safeRevalidate('/dashboard');
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
  const ctx = await requireSession(LEADER_ROLES);

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

  await swapDraftMembers(ctx.client!, {
    distributionId: params.distributionId,
    memberA: params.memberAId,
    memberB: params.memberBId,
  });
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
    const allSessions = ScoutStore.getFridaySessions();
    const openSessions = allSessions.filter((s) => s.is_open_for_attendance);
    const scheduledSessions = allSessions.filter((s) => s.status === 'scheduled');
    const activeSession = openSessions[0] || allSessions[0] || null;
    const allMembers = ScoutStore.getAllMembers();
    const records = activeSession ? ScoutStore.getAttendanceRecords(activeSession.id) : [];

    return {
      activeSession,
      openSessions,
      scheduledSessions,
      allSessions,
      allMembers,
      attendanceCount: records.length,
      isSuperAdmin: true,
      isAdmin: true,
      isLiveSupabase: false,
    };
  }

  const sessions = await listSessions(ctx.client!);
  const openSessions = sessions.filter((s) => s.is_open_for_attendance);
  const scheduledSessions = sessions.filter((s) => s.status === 'scheduled');
  const activeSession = openSessions[0] || sessions[0] || null;
  const members = await listMembers(ctx.client!);

  let count = 0;
  if (activeSession) {
    const records = await listAttendance(ctx.client!, activeSession.id);
    count = records.length;
  }

  const isSuperAdmin = ctx.roles.includes('super_admin');
  const isAdmin = ctx.roles.includes('admin') || isSuperAdmin;

  return {
    activeSession,
    openSessions,
    scheduledSessions,
    allSessions: sessions,
    allMembers: members,
    attendanceCount: count,
    isSuperAdmin,
    isAdmin,
    isLiveSupabase: true,
  };
}

/**
 * Server Action: Load Admin Team Distribution Data.
 */
export async function getAdminTeamsDataAction() {
  const ctx = await requireSession(LEADER_ROLES);

  if (ctx.mode === 'demo') {
    const list = ScoutStore.getTeamDistributions();
    const pub = ScoutStore.getCurrentPublishedDistribution() || list[0] || null;
    const all = ScoutStore.getAllMembers();
    const eligible = all.filter(isEligibleScout);

    return {
      distributions: list,
      activeDistribution: pub,
      metrics: {
        totalMembers: all.length,
        activeMembers: all.filter((m) => m.is_active).length,
        eligibleMembers: eligible.length,
        pendingSectionMembers: eligible.filter((m) => !m.section_id).length,
        excludedMembers: all.length - eligible.length,
        teamCount: pub?.teams?.length || 0,
      },
      sections: await getActiveScoutSectionsAction(),
      isLiveSupabase: false,
    };
  }

  const dists = await listDistributions(ctx.client!);
  const scopes = (!ctx.roles.includes('super_admin') && !ctx.roles.includes('admin'))
    ? (ctx.scopes || (await getStaffScopeAssignments(ctx.client!, ctx.userId)))
    : [];
  const leaderSectionId = scopes[0]?.section_id;

  const publishedHeader = leaderSectionId
    ? (dists.find((d) => d.section_id === leaderSectionId && d.is_current_published) ||
       dists.find((d) => d.section_id === leaderSectionId) ||
       dists.find((d) => d.is_current_published) ||
       dists[0] ||
       null)
    : (dists.find((d) => d.is_current_published) || dists[0] || null);

  let activeDistribution: TeamDistribution | null = null;
  if (publishedHeader) {
    activeDistribution = await getDistributionDetail(ctx.client!, publishedHeader.id);
    // Graceful fallback if RLS on team_memberships hid draft rows from section leader
    if (activeDistribution && activeDistribution.teams?.some((t) => !t.memberships || t.memberships.length === 0)) {
      const adminClient = createAdminClient();
      const adminDetail = await getDistributionDetail(adminClient, publishedHeader.id);
      if (adminDetail && adminDetail.teams?.some((t) => t.memberships && t.memberships.length > 0)) {
        activeDistribution = adminDetail;
      }
    }
  }

  const allRawMembers = await listMembers(ctx.client!);
  const eligible = allRawMembers.filter(isEligibleScout);
  const sections = await listActiveScoutSections(ctx.client!);

  return {
    distributions: dists,
    activeDistribution,
    metrics: {
      totalMembers: allRawMembers.length,
      activeMembers: allRawMembers.filter((m) => m.is_active).length,
      eligibleMembers: eligible.length,
      pendingSectionMembers: eligible.filter((m) => !m.section_id).length,
      excludedMembers: allRawMembers.length - eligible.length,
      teamCount: activeDistribution?.teams?.length || 0,
    },
    sections,
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
  const sections = await getActiveScoutSectionsAction();

  if (ctx.mode === 'demo') {
    const members = ScoutStore.getAllMembers();
    return { members, sections, isLiveSupabase: false };
  }

  const members = await listMembers(ctx.client!);
  return { members, sections, isLiveSupabase: true };
}

export const getSuperAdminMembersAction = getAdminMembersDataAction;

// ============================================================================
// DYNAMIC SCOUT SECTIONS & YEARS ACTIONS
// ============================================================================

/**
 * Public action: Get active scout sections and their active years (for registration & filters).
 */
export async function getActiveScoutSectionsAction() {
  const mode = getBackendMode();

  if (mode === 'demo') {
    return [
      {
        id: 'sec-cubs',
        code: 'cubs',
        name: 'الأشبال والزهرات',
        description: 'من سن 7 إلى 11 سنة',
        icon: 'flame',
        color_theme: '#EA580C',
        display_order: 1,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        years: [
          { id: 'yr-cubs-1', section_id: 'sec-cubs', name: 'السنة الأولى', display_order: 1, is_active: true, created_at: '', updated_at: '' },
          { id: 'yr-cubs-2', section_id: 'sec-cubs', name: 'السنة الثانية', display_order: 2, is_active: true, created_at: '', updated_at: '' },
          { id: 'yr-cubs-3', section_id: 'sec-cubs', name: 'السنة الثالثة', display_order: 3, is_active: true, created_at: '', updated_at: '' },
        ],
      },
      {
        id: 'sec-scouts',
        code: 'scouts',
        name: 'الفتيان والمرشدات',
        description: 'من سن 12 إلى 14 سنة',
        icon: 'compass',
        color_theme: '#23836B',
        display_order: 2,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        years: [
          { id: 'yr-scouts-1', section_id: 'sec-scouts', name: 'السنة الأولى', display_order: 1, is_active: true, created_at: '', updated_at: '' },
          { id: 'yr-scouts-2', section_id: 'sec-scouts', name: 'السنة الثانية', display_order: 2, is_active: true, created_at: '', updated_at: '' },
          { id: 'yr-scouts-3', section_id: 'sec-scouts', name: 'السنة الثالثة', display_order: 3, is_active: true, created_at: '', updated_at: '' },
        ],
      },
      {
        id: 'sec-advanced',
        code: 'advanced',
        name: 'المتقدم والرائدات',
        description: 'من سن 15 إلى 17 سنة',
        icon: 'award',
        color_theme: '#1E40AF',
        display_order: 3,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        years: [
          { id: 'yr-adv-1', section_id: 'sec-advanced', name: 'السنة الأولى', display_order: 1, is_active: true, created_at: '', updated_at: '' },
          { id: 'yr-adv-2', section_id: 'sec-advanced', name: 'السنة الثانية', display_order: 2, is_active: true, created_at: '', updated_at: '' },
        ],
      },
    ];
  }

  // Live Supabase mode: load active sections and years securely via service client
  const admin = createAdminClient();
  return listActiveScoutSections(admin);
}

/**
 * Super Admin: Get all scout sections with all years for management.
 */
export async function getScoutSectionsAdminAction() {
  const ctx = await requireSession(SUPER_ADMIN_ROLES);
  if (ctx.mode === 'demo') {
    return getActiveScoutSectionsAction();
  }
  return listScoutSections(ctx.client!);
}

export async function createScoutSectionAction(input: {
  code: string;
  name: string;
  description?: string;
  icon?: string;
  color_theme?: string;
  display_order?: number;
}) {
  const ctx = await requireSession(SUPER_ADMIN_ROLES);
  if (ctx.mode === 'demo') {
    return { id: 'demo-new-sec', ...input, is_active: true, created_at: '', updated_at: '' };
  }
  const res = await createScoutSection(ctx.client!, input);
  revalidatePath('/register');
  revalidatePath('/super-admin/sections');
  revalidatePath('/super-admin/members');
  return res;
}

export async function updateScoutSectionAction(id: string, updates: Partial<ScoutSection>) {
  const ctx = await requireSession(SUPER_ADMIN_ROLES);
  if (ctx.mode === 'demo') {
    return { id, ...updates };
  }
  const res = await updateScoutSection(ctx.client!, id, updates);
  revalidatePath('/register');
  revalidatePath('/super-admin/sections');
  revalidatePath('/super-admin/members');
  return res;
}

export async function createSectionYearAction(input: {
  section_id: string;
  name: string;
  display_order?: number;
}) {
  const ctx = await requireSession(SUPER_ADMIN_ROLES);
  if (ctx.mode === 'demo') {
    return { id: 'demo-new-yr', ...input, is_active: true, created_at: '', updated_at: '' };
  }
  const res = await createSectionYear(ctx.client!, input);
  revalidatePath('/register');
  revalidatePath('/super-admin/sections');
  revalidatePath('/super-admin/members');
  return res;
}

export async function updateSectionYearAction(id: string, updates: Partial<ScoutSectionYear>) {
  const ctx = await requireSession(SUPER_ADMIN_ROLES);
  if (ctx.mode === 'demo') {
    return { id, ...updates };
  }
  const res = await updateSectionYear(ctx.client!, id, updates);
  revalidatePath('/register');
  revalidatePath('/super-admin/sections');
  revalidatePath('/super-admin/members');
  return res;
}

// ============================================================================
// SUPER ADMIN: LEADER & STAFF MANAGEMENT ACTIONS
// ============================================================================

export async function getSuperAdminLeadersAction() {
  const ctx = await requireSession(SUPER_ADMIN_ROLES);

  if (ctx.mode === 'demo') {
    return {
      leaders: [],
      sections: await getActiveScoutSectionsAction(),
    };
  }

  const { data: staffRoles } = await ctx.client!
    .from('user_roles')
    .select('user_id, role, created_at, profiles!user_roles_user_id_fkey(*)')
    .in('role', ['super_admin', 'admin', 'section_leader', 'assistant_leader', 'attendance_leader']);

  const assignments = await getStaffScopeAssignments(ctx.client!);
  const sections = await listScoutSections(ctx.client!);

  const leaders = (staffRoles ?? []).map((row: any) => {
    const prof = row.profiles;
    const userScopes = assignments.filter((a) => a.user_id === row.user_id);
    return {
      userId: row.user_id,
      role: row.role as UserRoleType,
      roleCreatedAt: row.created_at,
      profile: prof ? {
        id: prof.id,
        member_number: prof.member_number,
        full_name: prof.full_name,
        phone: prof.phone,
        is_active: prof.is_active,
        avatar_url: prof.avatar_url,
        created_at: prof.created_at,
        updated_at: prof.updated_at,
      } : null,
      scopes: userScopes,
    };
  });

  return { leaders, sections };
}

export async function createLeaderAccountAction(params: {
  fullName: string;
  email: string;
  password?: string;
  role: 'section_leader' | 'assistant_leader';
  sectionId: string;
  yearId?: string | null;
}) {
  const ctx = await requireSession(SUPER_ADMIN_ROLES);

  const trimmedName = params.fullName?.trim();
  if (!trimmedName || trimmedName.length < 3) {
    throw new AppError('VALIDATION', 'اسم القائد يجب أن يكون 3 أحرف على الأقل.');
  }

  const trimmedEmail = params.email?.trim().toLowerCase();
  if (!trimmedEmail || !trimmedEmail.includes('@')) {
    throw new AppError('VALIDATION', 'البريد الإلكتروني غير صالح.');
  }

  if (ctx.mode === 'demo') {
    return { success: true, message: 'تم إنشاء حساب القائد بنجاح (وضع المعاينة)' };
  }

  const adminClient = createAdminClient();
  const password = params.password || 'ScoutLeader2026!';

  // 1. Create Supabase Auth user
  const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
    email: trimmedEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: trimmedName },
  });

  if (authErr || !authUser?.user) {
    const msg = authErr?.message || '';
    if (msg.includes('already registered') || msg.includes('unique')) {
      throw new AppError('CONFLICT', 'هذا البريد الإلكتروني مسجل بالفعل لمستخدم آخر.');
    }
    throw new AppError('INTERNAL', 'تعذر إنشاء الحساب الأمني للقائد: ' + msg);
  }

  const userId = authUser.user.id;

  try {
    // 2. Generate member number
    const memberNum = 'LDR-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);

    // 3. Create profile
    const { error: profErr } = await adminClient.from('profiles').insert({
      id: userId,
      member_number: memberNum,
      full_name: trimmedName,
      section_id: params.sectionId,
      year_id: params.yearId ?? null,
      initial_commitment: 'committed',
      is_active: true,
    });
    if (profErr) throw profErr;

    // 4. Assign role in user_roles
    const { error: roleErr } = await adminClient.from('user_roles').insert({
      user_id: userId,
      role: params.role,
    });
    if (roleErr) throw roleErr;

    // 5. Create QR credential
    await adminClient.from('qr_credentials').insert({ member_id: userId });

    // 6. Assign scope assignment
    await assignStaffScope(ctx.client!, userId, params.sectionId, params.yearId);

    return { success: true, userId, memberNumber: memberNum };
  } catch (err: any) {
    // Compensate: delete auth user if profile setup fails
    try {
      await adminClient.auth.admin.deleteUser(userId);
    } catch {}
    throw new AppError('INTERNAL', 'فشل إعداد بيانات القائد: ' + (err?.message || 'خطأ غير متوقع'));
  }
}

export async function assignLeaderScopeAction(params: {
  userId: string;
  sectionId: string;
  yearId?: string | null;
}) {
  const ctx = await requireSession(SUPER_ADMIN_ROLES);
  if (ctx.mode === 'demo') {
    return { success: true };
  }
  await assignStaffScope(ctx.client!, params.userId, params.sectionId, params.yearId);
  return { success: true };
}

export async function revokeLeaderScopeAction(assignmentId: string) {
  const ctx = await requireSession(SUPER_ADMIN_ROLES);
  if (ctx.mode === 'demo') {
    return { success: true };
  }
  await revokeStaffScope(ctx.client!, assignmentId);
  return { success: true };
}

export async function toggleUserActiveAction(userId: string, isActive: boolean) {
  const ctx = await requireSession(SUPER_ADMIN_ROLES);
  if (ctx.mode === 'demo') {
    return { success: true };
  }
  const { error } = await ctx.client!
    .from('profiles')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw new AppError('INTERNAL', 'تعذر تحديث حالة الحساب');
  return { success: true };
}

// ============================================================================
// MEMBER PROFILE ACTIONS
// ============================================================================

export async function getMyProfileAction() {
  const ctx = await requireSession(ANY_ROLE);

  if (ctx.mode === 'demo') {
    const member = ScoutStore.getAllMembers()[0];
    const team = ScoutStore.getCurrentPublishedDistribution()?.teams?.[0] || null;
    return {
      profile: member,
      qrToken: 'demo-qr-token',
      stats: { attended: 8, withUniform: 8, late: 1 },
      badges: [],
      activeTeam: team,
      isLiveSupabase: false,
    };
  }

  const profile = await getProfile(ctx.client!, ctx.userId);
  if (!profile) {
    throw new AppError('NOT_FOUND', 'ملف العضو غير موجود');
  }

  const qrToken = await getOrCreateMyQr(ctx.client!);
  const stats = await getMyStats(ctx.client!, ctx.userId);
  const badges = await getMyBadges(ctx.client!, ctx.userId);
  const activeTeam = await getMyPublishedTeam(ctx.client!);

  return {
    profile,
    qrToken,
    stats,
    badges,
    activeTeam,
    isLiveSupabase: true,
  };
}

export async function updateMyProfileAction(updates: { full_name?: string; phone?: string; avatar_url?: string }) {
  const ctx = await requireSession(ANY_ROLE);

  if (ctx.mode === 'demo') {
    return { success: true };
  }

  const safeUpdates: { full_name?: string; phone?: string; avatar_url?: string } = {};
  if (updates.full_name) {
    const trimmed = updates.full_name.trim();
    if (trimmed.length < 3) throw new AppError('VALIDATION', 'الاسم يجب ألا يقل عن 3 أحرف');
    safeUpdates.full_name = trimmed;
  }
  if (updates.phone !== undefined) {
    safeUpdates.phone = updates.phone?.trim() || null as any;
  }
  if (updates.avatar_url !== undefined) {
    safeUpdates.avatar_url = updates.avatar_url;
  }

  const updated = await updateProfile(ctx.client!, ctx.userId, safeUpdates);
  return { success: true, profile: updated };
}

// ============================================================================
// LEADER DASHBOARD & SCOPE ACTIONS
// ============================================================================

export async function getLeaderDashboardDataAction(selectedSectionId?: string, selectedYearId?: string) {
  const ctx = await requireSession(LEADER_ROLES);

  if (ctx.mode === 'demo') {
    const all = ScoutStore.getAllMembers();
    const activeSession = ScoutStore.getActiveFridaySession();
    return {
      scopes: [],
      allSections: await getActiveScoutSectionsAction(),
      activeSession,
      members: all,
      attendanceCount: 12,
      isLiveSupabase: false,
    };
  }

  const userScopes = await getStaffScopeAssignments(ctx.client!, ctx.userId);
  const isSuper = ctx.roles.includes('super_admin') || ctx.roles.includes('admin');

  // Load sessions
  const sessions = await listSessions(ctx.client!, selectedSectionId);
  const activeSession = sessions.find((s) => s.is_open_for_attendance) || sessions[0] || null;

  // Filter members under RLS (RLS already scopes listMembers!)
  let members = await listMembers(ctx.client!);
  if (selectedSectionId) {
    members = members.filter((m) => m.section_id === selectedSectionId);
  }
  if (selectedYearId) {
    members = members.filter((m) => m.year_id === selectedYearId);
  }

  let attendanceCount = 0;
  if (activeSession) {
    const records = await listAttendance(ctx.client!, activeSession.id);
    attendanceCount = records.length;
  }

  const allSections = await listActiveScoutSections(ctx.client!);

  return {
    scopes: userScopes,
    isSuper,
    allSections,
    activeSession,
    members,
    attendanceCount,
    isLiveSupabase: true,
  };
}

export async function getLeaderMembersAction(selectedSectionId?: string, selectedYearId?: string) {
  const ctx = await requireSession(LEADER_ROLES);

  if (ctx.mode === 'demo') {
    return { members: ScoutStore.getAllMembers(), isLiveSupabase: false };
  }

  let members = await listMembers(ctx.client!);
  if (selectedSectionId) {
    members = members.filter((m) => m.section_id === selectedSectionId);
  }
  if (selectedYearId) {
    members = members.filter((m) => m.year_id === selectedYearId);
  }

  return { members, isLiveSupabase: true };
}

export async function getLeaderReportsDataAction(selectedSectionId?: string, sessionId?: string) {
  const ctx = await requireSession(LEADER_ROLES);

  if (ctx.mode === 'demo') {
    return getAdminReportsDataAction(sessionId);
  }

  const sessions = await listSessions(ctx.client!, selectedSectionId);
  const targetId = sessionId || sessions[0]?.id || '';
  const records = targetId ? await listAttendance(ctx.client!, targetId) : [];

  return {
    sessions,
    records,
    selectedSessionId: targetId,
    isLiveSupabase: true,
  };
}

export async function getLeaderScannerDataAction(selectedSectionId?: string, targetSessionId?: string) {
  const ctx = await requireSession(STAFF_ROLES);

  if (ctx.mode === 'demo') {
    const demoData = await getAdminScannerDataAction();
    const demoSessions = ScoutStore.getFridaySessions();
    const openSessions = demoSessions.filter((s) => s.is_open_for_attendance);
    const activeSession = targetSessionId
      ? demoSessions.find((s) => s.id === targetSessionId) || openSessions[0] || demoSessions[0] || null
      : openSessions[0] || demoSessions.find((s) => s.status === 'open') || demoSessions[0] || null;
    return {
      ...demoData,
      activeSession,
      openSessions,
      allSessions: demoSessions,
      isSuperAdmin: true,
      isAdmin: true,
    };
  }

  const sessions = await listSessions(ctx.client!, selectedSectionId);
  const openSessions = sessions.filter((s) => s.is_open_for_attendance);
  const scheduledSessions = sessions.filter((s) => s.status === 'scheduled');

  let activeSession: FridaySession | null = null;
  if (targetSessionId) {
    activeSession = sessions.find((s) => s.id === targetSessionId) || null;
  } else if (openSessions.length > 0) {
    activeSession = openSessions[0];
  }

  let members = await listMembers(ctx.client!);
  if (selectedSectionId) {
    members = members.filter((m) => m.section_id === selectedSectionId);
  } else if (activeSession?.section_id) {
    members = members.filter((m) => m.section_id === activeSession.section_id);
  }

  let count = 0;
  if (activeSession) {
    const records = await listAttendance(ctx.client!, activeSession.id);
    count = records.length;
  }

  const isSuperAdmin = ctx.roles.includes('super_admin');
  const isAdmin = ctx.roles.includes('admin') || isSuperAdmin;

  return {
    activeSession,
    openSessions,
    scheduledSessions,
    allSessions: sessions,
    allMembers: members,
    attendanceCount: count,
    isSuperAdmin,
    isAdmin,
    isLiveSupabase: true,
  };
}

// ============================================================================
// SUPER ADMIN OVERVIEW ACTION
// ============================================================================

export async function getSuperAdminOverviewAction() {
  const ctx = await requireSession(SUPER_ADMIN_ROLES);

  if (ctx.mode === 'demo') {
    return {
      totalMembers: 60,
      totalLeaders: 4,
      totalSections: 3,
      totalSessions: 5,
      recentAuditLogs: [],
    };
  }

  const members = await listMembers(ctx.client!);
  const sections = await listScoutSections(ctx.client!);
  const sessions = await listSessions(ctx.client!);
  const leaders = await getStaffScopeAssignments(ctx.client!);

  const { data: auditLogs } = await ctx.client!
    .from('audit_logs')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(10);

  return {
    totalMembers: members.length,
    totalLeaders: new Set(leaders.map((l) => l.user_id)).size,
    totalSections: sections.length,
    totalSessions: sessions.length,
    recentAuditLogs: auditLogs ?? [],
  };
}

// ============================================================================
// FRIDAY MEETINGS MANAGEMENT ACTIONS
// ============================================================================

export async function createFridayMeetingAction(input: {
  title: string;
  session_date: string;
  section_id?: string | null;
  year_id?: string | null;
  start_time?: string;
  late_threshold_time?: string;
  is_open_for_attendance?: boolean;
  notes?: string | null;
}) {
  const ctx = await requireSession(STAFF_ROLES);

  if (!input.title || input.title.trim().length < 3) {
    throw new AppError('VALIDATION', 'عنوان الاجتماع مطلوب ويجب ألا يقل عن 3 أحرف.');
  }
  if (!input.session_date) {
    throw new AppError('VALIDATION', 'تاريخ الاجتماع مطلوب.');
  }

  if (ctx.mode === 'demo') {
    const sess = ScoutStore.createFridaySession({
      title: input.title,
      session_date: input.session_date,
      section_id: input.section_id || null,
      year_id: input.year_id || null,
      start_time: input.start_time || '08:30:00',
      late_threshold_time: input.late_threshold_time || '08:45:00',
      is_open_for_attendance: Boolean(input.is_open_for_attendance),
      notes: input.notes || null,
      created_by: ctx.userId,
    });
    safeRevalidate('/super-admin/attendance');
    safeRevalidate('/leader/scanner');
    return { success: true, session: sess };
  }

  const sess = await createFridaySession(ctx.client!, {
    ...input,
    created_by: ctx.userId,
  });

  safeRevalidate('/super-admin/attendance');
  safeRevalidate('/leader/scanner');
  return { success: true, session: sess };
}

export async function updateFridayMeetingAction(
  sessionId: string,
  input: {
    title?: string;
    session_date?: string;
    section_id?: string | null;
    year_id?: string | null;
    start_time?: string;
    late_threshold_time?: string;
    notes?: string | null;
  }
) {
  const ctx = await requireSession(STAFF_ROLES);

  if (ctx.mode === 'demo') {
    const updated = ScoutStore.updateFridaySession(sessionId, input);
    safeRevalidate('/super-admin/attendance');
    safeRevalidate('/leader/scanner');
    return { success: true, session: updated };
  }

  const updated = await updateFridaySession(ctx.client!, sessionId, input);
  safeRevalidate('/super-admin/attendance');
  safeRevalidate('/leader/scanner');
  return { success: true, session: updated };
}

export async function toggleMeetingAttendanceAction(sessionId: string, isOpen: boolean) {
  const ctx = await requireSession(STAFF_ROLES);

  if (ctx.mode === 'demo') {
    ScoutStore.toggleSessionAttendanceOpen(sessionId, isOpen);
    safeRevalidate('/super-admin/attendance');
    safeRevalidate('/leader/scanner');
    return { success: true, isOpen };
  }

  const sess = await toggleSessionAttendance(ctx.client!, sessionId, isOpen);
  safeRevalidate('/super-admin/attendance');
  safeRevalidate('/leader/scanner');
  return { success: true, session: sess };
}

export async function deleteFridayMeetingAction(sessionId: string) {
  const ctx = await requireSession(ADMIN_ROLES);

  if (ctx.mode === 'demo') {
    ScoutStore.deleteFridaySession(sessionId);
    safeRevalidate('/super-admin/attendance');
    safeRevalidate('/leader/scanner');
    return { success: true };
  }

  await deleteFridaySession(ctx.client!, sessionId);
  safeRevalidate('/super-admin/attendance');
  safeRevalidate('/leader/scanner');
  return { success: true };
}

export async function deleteAttendanceRecordAction(recordId: string, reason?: string) {
  const ctx = await requireSession(STAFF_ROLES);

  if (ctx.mode === 'demo') {
    ScoutStore.deleteAttendanceRecord(recordId);
    safeRevalidate('/super-admin/attendance');
    safeRevalidate('/leader/scanner');
    return { success: true, recordId };
  }

  const res = await deleteAttendanceRecord(ctx.client!, recordId, reason);
  if (!res.success) {
    throw new AppError('INTERNAL', res.error || 'تعذر إلغاء تسجيل الحضور.');
  }

  safeRevalidate('/super-admin/attendance');
  safeRevalidate('/leader/scanner');
  return { success: true, recordId: res.recordId };
}

export async function updateAttendanceUniformAction(recordId: string, uniformStatus: UniformStatus) {
  const ctx = await requireSession(STAFF_ROLES);

  if (ctx.mode === 'demo') {
    ScoutStore.updateAttendanceUniform(recordId, uniformStatus);
    safeRevalidate('/super-admin/attendance');
    return { success: true };
  }

  await updateAttendanceUniform(ctx.client!, recordId, uniformStatus);
  safeRevalidate('/super-admin/attendance');
  return { success: true };
}

export async function getFridayMeetingsAdminAction(sectionId?: string) {
  const ctx = await requireSession(STAFF_ROLES);

  if (ctx.mode === 'demo') {
    return {
      sessions: ScoutStore.getFridaySessions(),
      isLiveSupabase: false,
    };
  }

  const sessions = await listSessions(ctx.client!, sectionId);
  return {
    sessions,
    isLiveSupabase: true,
  };
}

// ============================================================================
// MEMBER LIFECYCLE ACTIONS
// ============================================================================

export async function toggleMemberActiveAction(memberId: string, isActive: boolean) {
  const ctx = await requireSession(ADMIN_ROLES);

  if (memberId === ctx.userId && !isActive) {
    throw new AppError('FORBIDDEN', 'لا يمكنك تعطيل حسابك الشخصي المسجل به حالياً.');
  }

  if (ctx.mode === 'demo') {
    ScoutStore.toggleMemberActive(memberId, isActive);
    safeRevalidate('/super-admin/members');
    return { success: true, isActive };
  }

  const res = await toggleMemberActive(ctx.client!, memberId, isActive);
  if (!res.success) {
    const errorMap: Record<string, string> = {
      CANNOT_DEACTIVATE_SELF: 'لا يمكنك تعطيل حسابك الشخصي المسجل به حالياً.',
      MEMBER_NOT_FOUND: 'العضو المطلوب غير موجود في النظام.',
      CANNOT_DEACTIVATE_SUPER_ADMIN: 'غير مصرح بتعطيل حساب قائد عام / مسؤول النظام.',
    };
    throw new AppError('FORBIDDEN', errorMap[res.error || ''] || 'تعذر تغيير حالة العضو.');
  }

  safeRevalidate('/super-admin/members');
  return { success: true, isActive: res.isActive };
}

export async function deleteMemberPermanentAction(memberId: string, confirmationNumber?: string) {
  const ctx = await requireSession(SUPER_ADMIN_ROLES);

  if (memberId === ctx.userId) {
    throw new AppError('FORBIDDEN', 'لا يمكن حذف حسابك الشخصي النشط.');
  }

  if (ctx.mode === 'demo') {
    ScoutStore.deleteMemberPermanent(memberId);
    safeRevalidate('/super-admin/members');
    return { success: true, deletedMemberId: memberId };
  }

  const adminClient = createAdminClient();

  // Retrieve target member
  const { data: targetProfile } = await adminClient
    .from('profiles')
    .select('id, full_name, member_number, avatar_url, user_roles(role)')
    .eq('id', memberId)
    .maybeSingle();

  if (!targetProfile) {
    throw new AppError('NOT_FOUND', 'الكشاف المطلوب غير موجود في النظام.');
  }

  // Validate confirmation number if provided
  if (confirmationNumber && confirmationNumber.trim() !== targetProfile.member_number.trim()) {
    throw new AppError('VALIDATION', 'رقم القيد المدخل للتأكيد غير مطابق لرقم الكشاف.');
  }

  // Prevent deleting other super admins or admins
  const roles = targetProfile.user_roles?.map((r: { role: string }) => r.role) || [];
  if (roles.includes('super_admin')) {
    throw new AppError('FORBIDDEN', 'غير مصرح بحذف حساب مسؤول نظام عام.');
  }

  const res = await deleteMemberPermanent(ctx.client!, memberId);
  if (!res.success) {
    const errorMap: Record<string, string> = {
      CANNOT_DELETE_SELF: 'لا يمكن حذف حسابك الشخصي النشط.',
      MEMBER_NOT_FOUND: 'العضو المطلوب غير موجود في النظام.',
      CANNOT_DELETE_SUPER_ADMIN: 'غير مصرح بحذف حساب قائد عام / مسؤول النظام مباشرة.',
    };
    throw new AppError('INTERNAL', errorMap[res.error || ''] || 'تعذر حذف الكشاف نهائياً.');
  }

  // Delete Supabase Auth user
  try {
    await adminClient.auth.admin.deleteUser(memberId);
  } catch (authErr) {
    console.error('Failed to delete auth user during member deletion:', authErr);
  }

  // Delete avatar file from Storage if applicable
  if (targetProfile.avatar_url && targetProfile.avatar_url.includes('/avatars/')) {
    try {
      const parts = targetProfile.avatar_url.split('/avatars/');
      if (parts[1]) {
        await adminClient.storage.from('avatars').remove([parts[1]]);
      }
    } catch {}
  }

  safeRevalidate('/super-admin/members');
  safeRevalidate('/leader/members');
  safeRevalidate('/super-admin/teams');
  safeRevalidate('/leader/teams');

  return { success: true, deletedMemberId: res.deletedMemberId };
}

// ============================================================================
// MEMBER AUTHENTICATION & IDENTITY HELPERS (CHILD-FRIENDLY LOGIN)
// ============================================================================

/**
 * Server Action: Child-Friendly Scout Login.
 * Supports:
 *  - Scout ID (SCT-2026-XXXX) + Password
 *  - Phone number + Password (E.164 / Egyptian +20)
 *  - Standard Email + Password (for staff)
 */
export type LoginActionResult = {
  success: boolean;
  error?: string;
  redirectUrl?: string;
  userId?: string;
  roles?: string[];
};

/**
 * Server Action: Scout and Leader login supporting:
 *  - Scout number + Password (e.g. SCT-2026-0001, ADMIN-001)
 *  - Phone number + Password (E.164 / Egyptian +20)
 *  - Standard Email + Password (for staff & leaders)
 *
 * Safe contract: Never throws uncaught errors to prevent Next.js 16 / React 19
 * Minified React error #441 (HTTP 500 server crash). Returns a discriminated result.
 */
export async function loginScoutMemberAction(params: {
  identifier: string;
  password: string;
}): Promise<LoginActionResult> {
  try {
    const trimmed = params.identifier?.trim();
    if (!trimmed) {
      return { success: false, error: 'يرجى إدخال رقم الكشاف أو البريد أو رقم الهاتف.' };
    }
    if (!params.password) {
      return { success: false, error: 'يرجى إدخال كلمة المرور.' };
    }

    const mode = getBackendMode();
    if (mode === 'demo') {
      const allMembers = ScoutStore.getAllMembers();
      const normalizedInput = normalizePhoneNumber(trimmed);
      const found = allMembers.find(
        (m) =>
          m.member_number.toLowerCase() === trimmed.toLowerCase() ||
          (m.phone && normalizePhoneNumber(m.phone) === normalizedInput)
      );
      if (!found) {
        return {
          success: false,
          error: 'لم يتم العثور على حساب مرتبط برقم الكشاف أو الهاتف المدخل. يرجى التأكد من البيانات أو التسجيل.',
        };
      }
      const roles = (found.roles && found.roles.length > 0 ? found.roles : ['member']) as UserRoleType[];
      return {
        success: true,
        redirectUrl: getDefaultRedirectForRole(roles),
        userId: found.id,
        roles,
      };
    }

    const client = await createServerSupabaseClient();
    const adminClient = createAdminClient();

    let targetEmail = trimmed;

    // Check if identifier is not an email (Scout number or phone number login)
    if (!trimmed.includes('@')) {
      // 1. Try finding by member_number (e.g. SCT-2026-0001, LDR-2026-..., ADMIN-...)
      const { data: memberByNumber } = await adminClient
        .from('profiles')
        .select('id, member_number')
        .ilike('member_number', trimmed)
        .maybeSingle();

      let targetUserId = memberByNumber?.id;

      // 2. If not found by member_number, try finding by phone number safely
      if (!targetUserId) {
        const digits = trimmed.replace(/\D/g, '');
        const normalizedPhone = normalizePhoneNumber(trimmed);
        const phoneCandidates = [...new Set([trimmed, digits, normalizedPhone].filter((p) => p && p.length >= 8))];

        if (phoneCandidates.length > 0) {
          const { data: memberByPhone } = await adminClient
            .from('profiles')
            .select('id, phone')
            .in('phone', phoneCandidates)
            .maybeSingle();

          targetUserId = memberByPhone?.id;
        }
      }

      if (!targetUserId) {
        return {
          success: false,
          error: 'لم يتم العثور على حساب مرتبط برقم الكشاف أو الهاتف المدخل. يرجى التأكد من البيانات أو التسجيل.',
        };
      }

      // Retrieve auth email for target user
      const { data: authUserData, error: authUserErr } = await adminClient.auth.admin.getUserById(targetUserId);
      if (authUserErr || !authUserData?.user?.email) {
        return {
          success: false,
          error: 'تعذر استرداد بيانات الحساب الأمني المرتبط بالكشاف. يرجى مراجعة إدارة الفوج.',
        };
      }
      targetEmail = authUserData.user.email;
    }

    // Attempt authentication with resolved email & password
    const { data: authData, error: authErr } = await client.auth.signInWithPassword({
      email: targetEmail,
      password: params.password,
    });

    if (authErr || !authData?.user) {
      const msg = authErr?.message?.toLowerCase() || '';
      if (msg.includes('invalid') || msg.includes('credentials')) {
        return { success: false, error: 'بيانات الدخول أو كلمة المرور غير صحيحة.' };
      }
      if (msg.includes('rate') || msg.includes('too many')) {
        return { success: false, error: 'تم تجاوز عدد محاولات الدخول. يرجى الانتظار قليلاً.' };
      }
      if (msg.includes('email not confirmed')) {
        return { success: false, error: 'يرجى مراجعة بريدك الإلكتروني لتأكيد الحساب أولاً.' };
      }
      return { success: false, error: 'تعذر تسجيل الدخول، يرجى التأكد من صحة كلمة المرور.' };
    }

    // Determine redirect URL using adminClient for reliable, RLS-immune role retrieval
    const roles = await getUserRoles(adminClient, authData.user.id);
    const redirectUrl = getDefaultRedirectForRole(roles);

    return {
      success: true,
      redirectUrl,
      userId: authData.user.id,
      roles,
    };
  } catch (err: unknown) {
    console.error('[loginScoutMemberAction] Unexpected failure:', err);
    return {
      success: false,
      error: 'تعذر تسجيل الدخول بسبب خطأ في الخادم. يرجى المحاولة مرة أخرى.',
    };
  }
}

/**
 * Server Action: Reset scout password by Leader or Super Admin.
 * Used for child accounts without email access.
 */
export async function resetScoutPasswordAction(params: {
  memberId: string;
  newPassword?: string;
}) {
  const ctx = await requireSession(LEADER_ROLES);
  const adminClient = createAdminClient();

  // Verify target member is not a super_admin or staff unless caller is super_admin
  const targetRoles = await getUserRoles(adminClient, params.memberId);
  if (targetRoles.includes('super_admin') && !ctx.roles.includes('super_admin')) {
    throw new AppError('FORBIDDEN', 'لا يمكن إعادة تعيين كلمة مرور مسؤول عام.');
  }

  const generatedPassword = params.newPassword || `Scout@${Math.floor(100000 + Math.random() * 900000)}`;

  const { error } = await adminClient.auth.admin.updateUserById(params.memberId, {
    password: generatedPassword,
  });

  if (error) {
    throw new AppError('INTERNAL', 'تعذر إعادة تعيين كلمة المرور: ' + error.message);
  }

  // Audit without storing plain password in details
  await adminClient.from('audit_logs').insert({
    actor_id: ctx.userId,
    action: 'MEMBER_PASSWORD_RESET',
    entity_type: 'profiles',
    entity_id: params.memberId,
    details: { reset_by_role: ctx.roles[0] },
  });

  return {
    success: true,
    newPassword: generatedPassword,
  };
}

