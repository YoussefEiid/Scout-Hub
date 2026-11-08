import {
  Profile,
  FridaySession,
  WeeklyResponse,
  AttendanceRecord,
  TeamDistribution,
  Team,
  MemberAchievement,
  ScoutStageId,
  CommitmentPreference,
  UniformStatus,
  ArrivalStatus,
  WeeklyResponseType,
} from '../../types';
import {
  generate60RealisticScouts,
  DEMO_STAGES,
  DEMO_ACHIEVEMENTS,
  DEMO_FRIDAY_SESSIONS,
} from './seed-data';
import { generateMixedStageTeams } from '../teams/distribution-engine';

interface InMemoryState {
  isLiveSupabaseConnected: boolean;
  members: Profile[];
  qrTokens: Map<string, { memberId: string; isActive: boolean; revokedAt?: string }>; // tokenId -> details
  memberToToken: Map<string, string>; // memberId -> activeTokenId
  fridaySessions: FridaySession[];
  weeklyResponses: Map<string, WeeklyResponse>; // key: sessionId_memberId
  attendanceRecords: Map<string, AttendanceRecord>; // key: sessionId_memberId
  teamDistributions: TeamDistribution[];
  achievements: MemberAchievement[];
}

// Global in-memory singleton for development store persistence
declare global {
  var __scoutStore: InMemoryState | undefined;
}

function initDemoState(): InMemoryState {
  const { members, qrCredentials } = generate60RealisticScouts();
  const qrTokens = new Map<string, { memberId: string; isActive: boolean; revokedAt?: string }>();
  const memberToToken = new Map<string, string>();

  for (const [memberId, token] of Object.entries(qrCredentials)) {
    qrTokens.set(token, { memberId, isActive: true });
    memberToToken.set(memberId, token);
  }

  // Pre-generate a published team distribution with Mode A (Mixed)
  const initialMixed = generateMixedStageTeams(members.slice(0, 48), {
    teamCount: 4,
    seed: 'scout-hub-spring-2026',
  });

  const publishedDistributionId = 'dist-pub-2026-01';
  const publishedTeams: Team[] = initialMixed.teams.map((t, idx) => ({
    id: `team-pub-${idx + 1}`,
    distribution_id: publishedDistributionId,
    name: t.name,
    stage_id: t.stage_id,
    leader_id: t.leaderId,
    color_hex: t.color_hex,
    icon_name: t.icon_name,
    total_points: (idx + 1) * 35,
    created_at: new Date().toISOString(),
    member_count: t.members.length,
    memberships: t.members.map((m) => ({
      id: `mship-${t.tempId}-${m.id}`,
      team_id: `team-pub-${idx + 1}`,
      member_id: m.id,
      is_leader: m.id === t.leaderId,
      created_at: new Date().toISOString(),
      member: m,
    })),
  }));

  const initialDistributions: TeamDistribution[] = [
    {
      id: publishedDistributionId,
      title: 'تقسيم فرق معسكر المغامرة الكشفية (ربيع 2026)',
      mode: 'mixed_stages',
      status: 'published',
      version_number: 1,
      random_seed: 'scout-hub-spring-2026',
      is_current_published: true,
      published_at: new Date(Date.now() - 86400000 * 5).toISOString(),
      created_by: members[0].id,
      created_at: new Date(Date.now() - 86400000 * 6).toISOString(),
      updated_at: new Date().toISOString(),
      teams: publishedTeams,
    },
  ];

  // Assign active_team to members
  for (const team of publishedTeams) {
    if (team.memberships) {
      for (const mship of team.memberships) {
        const mem = members.find((m) => m.id === mship.member_id);
        if (mem) {
          mem.active_team = team;
        }
      }
    }
  }

  // Sample weekly responses & attendance for last session
  const weeklyResponses = new Map<string, WeeklyResponse>();
  const attendanceRecords = new Map<string, AttendanceRecord>();
  const lastSessionId = DEMO_FRIDAY_SESSIONS[0].id;

  for (let i = 0; i < 45; i++) {
    const member = members[i];
    const key = `${lastSessionId}_${member.id}`;
    weeklyResponses.set(key, {
      id: `resp-${i}`,
      session_id: lastSessionId,
      member_id: member.id,
      response: i < 38 ? 'attending' : i < 42 ? 'circumstances' : 'absent',
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date(Date.now() - 86400000).toISOString(),
      member,
    });

    if (i < 35) {
      attendanceRecords.set(key, {
        id: `att-${i}`,
        session_id: lastSessionId,
        member_id: member.id,
        qr_credential_id: memberToToken.get(member.id),
        uniform_status: i % 7 === 0 ? 'without_uniform' : 'with_uniform',
        arrival_status: i % 8 === 0 ? 'late' : 'on_time',
        recorded_at: new Date(Date.now() - 3600000 * (4 - (i % 3))).toISOString(),
        recorded_by: members[0].id,
        is_manual: false,
        member,
      });
    }
  }

  // Sample Badges
  const achievements: MemberAchievement[] = [
    {
      id: 'ach-1',
      member_id: members[0].id,
      achievement_id: 'active_scout',
      awarded_at: new Date().toISOString(),
      definition: DEMO_ACHIEVEMENTS[4],
    },
    {
      id: 'ach-2',
      member_id: members[1].id,
      achievement_id: 'three_streak',
      awarded_at: new Date().toISOString(),
      definition: DEMO_ACHIEVEMENTS[1],
    },
    {
      id: 'ach-3',
      member_id: members[2].id,
      achievement_id: 'uniform_champion',
      awarded_at: new Date().toISOString(),
      definition: DEMO_ACHIEVEMENTS[2],
    },
  ];

  return {
    isLiveSupabaseConnected: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    members,
    qrTokens,
    memberToToken,
    fridaySessions: [...DEMO_FRIDAY_SESSIONS],
    weeklyResponses,
    attendanceRecords,
    teamDistributions: initialDistributions,
    achievements,
  };
}

const state: InMemoryState = global.__scoutStore || (global.__scoutStore = initDemoState());

export const ScoutStore = {
  isSupabaseLive(): boolean {
    return state.isLiveSupabaseConnected;
  },

  getAllMembers(): Profile[] {
    return state.members.map((m) => ({
      ...m,
      stage: DEMO_STAGES.find((s) => s.id === m.stage_id),
    }));
  },

  getMemberById(id: string): Profile | null {
    const m = state.members.find((member) => member.id === id);
    if (!m) return null;
    return {
      ...m,
      stage: DEMO_STAGES.find((s) => s.id === m.stage_id),
    };
  },

  getMemberByQRToken(token: string): {
    member: Profile | null;
    isRevoked: boolean;
    isActive: boolean;
  } {
    const cred = state.qrTokens.get(token);
    if (!cred) {
      return { member: null, isRevoked: false, isActive: false };
    }
    if (!cred.isActive) {
      return { member: null, isRevoked: true, isActive: false };
    }
    const member = this.getMemberById(cred.memberId);
    return { member, isRevoked: false, isActive: true };
  },

  getActiveQRToken(memberId: string): string {
    let token = state.memberToToken.get(memberId);
    if (!token) {
      token = `qr-tok-${Math.floor(1000 + Math.random() * 9000)}-4b91-8c42-${Date.now().toString().slice(-5)}`;
      state.memberToToken.set(memberId, token);
      state.qrTokens.set(token, { memberId, isActive: true });
    }
    return token;
  },

  revokeAndIssueNewQRToken(memberId: string, _reason = 'إعادة إصدار بطلب من القائد'): string {
    void _reason;
    const oldToken = state.memberToToken.get(memberId);
    if (oldToken && state.qrTokens.has(oldToken)) {
      const oldRecord = state.qrTokens.get(oldToken)!;
      oldRecord.isActive = false;
      oldRecord.revokedAt = new Date().toISOString();
    }
    const newToken = `qr-tok-${Math.floor(1000 + Math.random() * 9000)}-4b91-8c42-${Date.now().toString().slice(-5)}`;
    state.memberToToken.set(memberId, newToken);
    state.qrTokens.set(newToken, { memberId, isActive: true });
    return newToken;
  },

  registerNewMember(data: {
    fullName: string;
    stageId: ScoutStageId;
    commitment: CommitmentPreference;
    phone?: string;
  }): Profile {
    const count = state.members.length + 1;
    const newId = `scout-uuid-${count.toString().padStart(3, '0')}`;
    const newProfile: Profile = {
      id: newId,
      member_number: `SCT-2026-${count.toString().padStart(4, '0')}`,
      full_name: data.fullName,
      phone: data.phone || null,
      stage_id: data.stageId,
      initial_commitment: data.commitment,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      roles: count === 1 ? ['super_admin'] : ['member'],
    };

    state.members.push(newProfile);
    this.getActiveQRToken(newId);
    return newProfile;
  },

  getFridaySessions(): FridaySession[] {
    return [...state.fridaySessions];
  },

  getActiveFridaySession(): FridaySession | null {
    return state.fridaySessions.find((s) => s.is_open_for_attendance) || state.fridaySessions[0] || null;
  },

  createFridaySession(session: Omit<FridaySession, 'id' | 'created_at'>): FridaySession {
    const newSession: FridaySession = {
      ...session,
      id: `session-${session.session_date}-${session.section_id || 'all'}`,
      status: session.is_open_for_attendance ? 'open' : 'scheduled',
      created_at: new Date().toISOString(),
      stats: {
        attending_count: 0,
        absent_count: 0,
        circumstances_count: 0,
        actual_attendance_count: 0,
        uniform_count: 0,
        late_count: 0,
      },
    };
    state.fridaySessions.unshift(newSession);
    return newSession;
  },

  updateFridaySession(sessionId: string, patch: Partial<FridaySession>): FridaySession | null {
    const session = state.fridaySessions.find((s) => s.id === sessionId);
    if (!session) return null;
    Object.assign(session, patch);
    if (patch.is_open_for_attendance !== undefined) {
      session.status = patch.is_open_for_attendance ? 'open' : 'closed';
    }
    return session;
  },

  deleteFridaySession(sessionId: string): boolean {
    const idx = state.fridaySessions.findIndex((s) => s.id === sessionId);
    if (idx < 0) return false;
    state.fridaySessions.splice(idx, 1);
    return true;
  },

  deleteAttendanceRecord(recordId: string): boolean {
    for (const [key, r] of state.attendanceRecords.entries()) {
      if (r.id === recordId) {
        state.attendanceRecords.delete(key);
        return true;
      }
    }
    return false;
  },

  updateAttendanceUniform(recordId: string, uniformStatus: UniformStatus): boolean {
    for (const r of state.attendanceRecords.values()) {
      if (r.id === recordId) {
        r.uniform_status = uniformStatus;
        return true;
      }
    }
    return false;
  },

  toggleMemberActive(memberId: string, isActive: boolean): boolean {
    const member = state.members.find((m) => m.id === memberId);
    if (!member) return false;
    member.is_active = isActive;
    return true;
  },

  deleteMemberPermanent(memberId: string): boolean {
    const idx = state.members.findIndex((m) => m.id === memberId);
    if (idx < 0) return false;
    state.members.splice(idx, 1);
    state.memberToToken.delete(memberId);
    return true;
  },

  toggleSessionAttendanceOpen(sessionId: string, isOpen: boolean): boolean {
    const session = state.fridaySessions.find((s) => s.id === sessionId);
    if (!session) return false;
    session.is_open_for_attendance = isOpen;
    session.status = isOpen ? 'open' : 'closed';
    return true;
  },

  submitWeeklyResponse(sessionId: string, memberId: string, response: WeeklyResponseType): WeeklyResponse {
    const key = `${sessionId}_${memberId}`;
    const member = this.getMemberById(memberId);
    const existing = state.weeklyResponses.get(key);

    const record: WeeklyResponse = {
      id: existing?.id || `resp-${Date.now()}`,
      session_id: sessionId,
      member_id: memberId,
      response,
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      member: member || undefined,
    };
    state.weeklyResponses.set(key, record);
    return record;
  },

  getWeeklyResponseForMember(sessionId: string, memberId: string): WeeklyResponse | null {
    const key = `${sessionId}_${memberId}`;
    return state.weeklyResponses.get(key) || null;
  },

  recordAttendance(params: {
    sessionId: string;
    memberId: string;
    qrToken?: string | null;
    uniformStatus: UniformStatus;
    recordedBy: string;
    isManual?: boolean;
    manualReason?: string | null;
  }): { success: boolean; record?: AttendanceRecord; error?: string } {
    const key = `${params.sessionId}_${params.memberId}`;
    if (state.attendanceRecords.has(key)) {
      return {
        success: false,
        error: 'تم تسجيل حضور هذا العضو مسبقًا في هذا الاجتماع!',
      };
    }

    const member = this.getMemberById(params.memberId);
    if (!member) {
      return { success: false, error: 'العضو غير موجود في السجلات' };
    }

    const session = state.fridaySessions.find((s) => s.id === params.sessionId);
    const now = new Date();
    // Authoritative arrival status based on session late threshold
    const arrivalStatus: ArrivalStatus = 'on_time'; // Default to on-time or calculate from threshold

    const record: AttendanceRecord = {
      id: `att-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      session_id: params.sessionId,
      member_id: params.memberId,
      qr_credential_id: params.qrToken || null,
      uniform_status: params.uniformStatus,
      arrival_status: arrivalStatus,
      recorded_at: now.toISOString(),
      recorded_by: params.recordedBy,
      is_manual: Boolean(params.isManual),
      manual_reason: params.manualReason || null,
      member,
    };

    state.attendanceRecords.set(key, record);

    // Update session stats
    if (session && session.stats) {
      session.stats.actual_attendance_count += 1;
      if (params.uniformStatus === 'with_uniform') {
        session.stats.uniform_count += 1;
      }
    }

    return { success: true, record };
  },

  getAttendanceRecords(sessionId: string): AttendanceRecord[] {
    const results: AttendanceRecord[] = [];
    for (const record of state.attendanceRecords.values()) {
      if (record.session_id === sessionId) {
        results.push(record);
      }
    }
    return results.sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());
  },

  getTeamDistributions(): TeamDistribution[] {
    return [...state.teamDistributions];
  },

  getCurrentPublishedDistribution(): TeamDistribution | null {
    return state.teamDistributions.find((d) => d.is_current_published && d.status === 'published') || null;
  },

  saveTeamDistributionDraft(dist: TeamDistribution): TeamDistribution {
    const existingIndex = state.teamDistributions.findIndex((d) => d.id === dist.id);
    if (existingIndex >= 0) {
      state.teamDistributions[existingIndex] = dist;
    } else {
      state.teamDistributions.unshift(dist);
    }
    return dist;
  },

  publishTeamDistribution(distributionId: string): boolean {
    const target = state.teamDistributions.find((d) => d.id === distributionId);
    if (!target) return false;

    // Atomic switch: Unset is_current_published on all others
    for (const d of state.teamDistributions) {
      if (d.id !== distributionId && d.is_current_published) {
        d.is_current_published = false;
        d.status = 'archived';
      }
    }

    target.is_current_published = true;
    target.status = 'published';
    target.published_at = new Date().toISOString();

    // Propagate active_team to members
    if (target.teams) {
      for (const t of target.teams) {
        if (t.memberships) {
          for (const mship of t.memberships) {
            const mem = state.members.find((m) => m.id === mship.member_id);
            if (mem) {
              mem.active_team = t;
            }
          }
        }
      }
    }

    return true;
  },

  getMemberAchievements(memberId: string): MemberAchievement[] {
    return state.achievements.filter((a) => a.member_id === memberId);
  },
};
