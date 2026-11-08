import { Profile, ScoutStageId } from '../../types';
import { getSectionDisplayName } from '../sections/section-helper';

export interface GeneratedTeam {
  tempId: string;
  name: string;
  stage_id?: ScoutStageId | null;
  section_id?: string | null;
  color_hex: string;
  icon_name: string;
  members: Profile[];
  leaderId?: string | null;
}

export interface DistributionResult {
  seed: string;
  mode: 'mixed_stages' | 'separate_stages';
  teams: GeneratedTeam[];
  unassignedMembers: Profile[];
  statistics: {
    totalMembers: number;
    assignedCount: number;
    unassignedCount: number;
    teamCount: number;
    imbalanceReport?: string;
  };
}

export interface MixedDistributionConfig {
  teamCount: number;
  teamNames?: string[];
  seed?: string;
  sectionId?: string;
}

export interface SeparateDistributionConfig {
  stageTeamCounts?: Partial<Record<string, number>>;
  stageTeamNames?: Partial<Record<string, string[]>>;
  sectionTeamCounts?: Record<string, number>;
  seed?: string;
}

// Scout Adventure Default Team Names & Colors
export const DEFAULT_TEAM_TEMPLATES = [
  { name: 'طليعة النسور', icon: 'compass', color: '#173C32' },
  { name: 'طليعة الفهود', icon: 'zap', color: '#23836B' },
  { name: 'طليعة الذئاب', icon: 'shield', color: '#E89B50' },
  { name: 'طليعة الصقور', icon: 'wind', color: '#24342E' },
  { name: 'طليعة الأسود', icon: 'flame', color: '#B45309' },
  { name: 'طليعة الوعول', icon: 'mountain', color: '#047857' },
  { name: 'طليعة الفرسان', icon: 'sword', color: '#4338CA' },
  { name: 'طليعة النجوم', icon: 'star', color: '#D97706' },
];

/**
 * Identifies eligible scout members for team distribution:
 * must be active, must NOT have administrative/leadership roles.
 */
export function isEligibleScout(m: Profile): boolean {
  if (!m || !m.is_active) return false;
  const staffRoles = ['super_admin', 'admin', 'section_leader', 'assistant_leader', 'attendance_leader'];
  if (m.roles?.some((r) => staffRoles.includes(r))) return false;
  return true;
}

/**
 * Deterministic Pseudo-Random Number Generator (Mulberry32)
 */
function createSeededRandom(seedStr: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let s = h >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seeded Fisher-Yates Shuffle
 */
function seededShuffle<T>(array: T[], rng: () => number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generate Mixed Balanced Teams (Mode A)
 * Balances total team size, section/stage proportions, and commitment levels.
 */
export function generateMixedStageTeams(
  members: Profile[],
  config: MixedDistributionConfig
): DistributionResult {
  const seed = config.seed || Math.random().toString(36).substring(2, 10);
  const rng = createSeededRandom(seed);

  // Filter only valid active scout members
  const uniqueMembersMap = new Map<string, Profile>();
  for (const m of members) {
    if (m && m.id && !uniqueMembersMap.has(m.id)) {
      uniqueMembersMap.set(m.id, m);
    }
  }
  const uniqueMembers = Array.from(uniqueMembersMap.values());

  if (uniqueMembers.length === 0) {
    return {
      seed,
      mode: 'mixed_stages',
      teams: [],
      unassignedMembers: [],
      statistics: {
        totalMembers: 0,
        assignedCount: 0,
        unassignedCount: 0,
        teamCount: 0,
        imbalanceReport: 'لا يوجد أعضاء كشافة مؤهلين للتوزيع',
      },
    };
  }

  // Adjust team count: cannot have more teams than members
  const desiredCount = Math.max(1, config.teamCount || 2);
  const teamCount = Math.min(desiredCount, uniqueMembers.length);

  // Initialize Teams
  const teams: GeneratedTeam[] = [];
  for (let i = 0; i < teamCount; i++) {
    const template = DEFAULT_TEAM_TEMPLATES[i % DEFAULT_TEAM_TEMPLATES.length];
    const customName = config.teamNames?.[i];
    teams.push({
      tempId: `team_mixed_${i + 1}`,
      name: customName?.trim() || `${template.name} ${i >= DEFAULT_TEAM_TEMPLATES.length ? i + 1 : ''}`.trim(),
      stage_id: null,
      section_id: config.sectionId || null,
      color_hex: template.color,
      icon_name: template.icon,
      members: [],
    });
  }

  // Stratify members by: section/stage + commitment
  const strataMap = new Map<string, Profile[]>();
  for (const member of uniqueMembers) {
    const scopeKey = member.section_id || member.stage_id || 'general';
    const key = `${scopeKey}__${member.initial_commitment || 'committed'}`;
    if (!strataMap.has(key)) {
      strataMap.set(key, []);
    }
    strataMap.get(key)!.push(member);
  }

  let teamPointer = 0;
  const sortedKeys = Array.from(strataMap.keys()).sort();

  for (const key of sortedKeys) {
    const stratumMembers = seededShuffle(strataMap.get(key)!, rng);
    for (const member of stratumMembers) {
      let targetTeamIndex = teamPointer % teamCount;
      let minSize = teams[targetTeamIndex].members.length;

      for (let t = 0; t < teamCount; t++) {
        const candidate = (teamPointer + t) % teamCount;
        if (teams[candidate].members.length < minSize) {
          minSize = teams[candidate].members.length;
          targetTeamIndex = candidate;
        }
      }

      teams[targetTeamIndex].members.push(member);
      teamPointer = (targetTeamIndex + 1) % teamCount;
    }
  }

  // Auto-select patrol leader if not set
  for (const team of teams) {
    if (team.members.length > 0) {
      const leaderCandidate =
        team.members.find((m) => m.stage_id === 'stage_3') ||
        team.members.find((m) => m.initial_commitment === 'committed') ||
        team.members[0];
      team.leaderId = leaderCandidate.id;
    }
  }

  // Verify and Report Imbalance
  const teamSizes = teams.map((t) => t.members.length);
  const minTeamSize = Math.min(...teamSizes);
  const maxTeamSize = Math.max(...teamSizes);
  const diff = maxTeamSize - minTeamSize;
  const imbalanceReport =
    diff > 1
      ? `توزيع متوازن مع فرق طفيف (${diff} أعضاء) بسبب عدم قابلية العدد الكلي للقسمة بالتساوي.`
      : undefined;

  return {
    seed,
    mode: 'mixed_stages',
    teams,
    unassignedMembers: [],
    statistics: {
      totalMembers: uniqueMembers.length,
      assignedCount: uniqueMembers.length,
      unassignedCount: 0,
      teamCount: teams.length,
      imbalanceReport,
    },
  };
}

/**
 * Generate Section/Stage-Separated Teams (Mode B)
 * Groups members by section or stage and distributes them cleanly.
 */
export function generateSeparateStageTeams(
  members: Profile[],
  config: SeparateDistributionConfig
): DistributionResult {
  const seed = config.seed || Math.random().toString(36).substring(2, 10);
  const rng = createSeededRandom(seed);

  // Deduplicate
  const uniqueMembersMap = new Map<string, Profile>();
  for (const m of members) {
    if (m && m.id && !uniqueMembersMap.has(m.id)) {
      uniqueMembersMap.set(m.id, m);
    }
  }
  const uniqueMembers = Array.from(uniqueMembersMap.values());

  if (uniqueMembers.length === 0) {
    return {
      seed,
      mode: 'separate_stages',
      teams: [],
      unassignedMembers: [],
      statistics: {
        totalMembers: 0,
        assignedCount: 0,
        unassignedCount: 0,
        teamCount: 0,
        imbalanceReport: 'لا يوجد أعضاء كشافة مؤهلين للتوزيع',
      },
    };
  }

  // Group members by section_id or stage_id
  const groupsMap = new Map<string, { label: string; stageId?: ScoutStageId | null; sectionId?: string | null; members: Profile[] }>();

  for (const member of uniqueMembers) {
    const key = member.section_id || member.stage_id || 'unassigned';
    if (!groupsMap.has(key)) {
      const label = getSectionDisplayName(member, 'القسم العام');
      groupsMap.set(key, {
        label,
        stageId: member.stage_id || null,
        sectionId: member.section_id || null,
        members: [],
      });
    }
    groupsMap.get(key)!.members.push(member);
  }

  const allTeams: GeneratedTeam[] = [];
  const unassigned: Profile[] = [];

  for (const [groupKey, group] of groupsMap.entries()) {
    const countBySection = config.sectionTeamCounts?.[groupKey];
    const countByStage = config.stageTeamCounts?.[groupKey];
    const requestedCount = countBySection ?? countByStage ?? (group.members.length >= 4 ? 2 : 1);

    if (requestedCount <= 0 || group.members.length === 0) {
      if (group.members.length > 0) {
        unassigned.push(...group.members);
      }
      continue;
    }

    const effectiveTeamCount = Math.min(requestedCount, group.members.length);
    const shuffled = seededShuffle(group.members, rng);
    const groupTeams: GeneratedTeam[] = [];

    for (let i = 0; i < effectiveTeamCount; i++) {
      const template = DEFAULT_TEAM_TEMPLATES[(allTeams.length + i) % DEFAULT_TEAM_TEMPLATES.length];
      const customName = config.stageTeamNames?.[groupKey]?.[i];
      groupTeams.push({
        tempId: `team_${groupKey}_${i + 1}`,
        name: customName?.trim() || `${template.name} (${group.label})`,
        stage_id: group.stageId,
        section_id: group.sectionId,
        color_hex: template.color,
        icon_name: template.icon,
        members: [],
      });
    }

    // Distribute among group teams
    for (let i = 0; i < shuffled.length; i++) {
      const targetTeamIndex = i % effectiveTeamCount;
      groupTeams[targetTeamIndex].members.push(shuffled[i]);
    }

    // Assign leader
    for (const team of groupTeams) {
      if (team.members.length > 0) {
        const leader =
          team.members.find((m) => m.initial_commitment === 'committed') ||
          team.members[0];
        team.leaderId = leader.id;
      }
    }

    allTeams.push(...groupTeams);
  }

  return {
    seed,
    mode: 'separate_stages',
    teams: allTeams,
    unassignedMembers: unassigned,
    statistics: {
      totalMembers: uniqueMembers.length,
      assignedCount: uniqueMembers.length - unassigned.length,
      unassignedCount: unassigned.length,
      teamCount: allTeams.length,
      imbalanceReport:
        unassigned.length > 0
          ? `يوجد ${unassigned.length} عضو لم تخصص لهم فرق في التوزيع الحالي.`
          : undefined,
    },
  };
}
