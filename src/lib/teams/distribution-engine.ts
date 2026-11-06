import { Profile, ScoutStageId } from '../../types';

export interface GeneratedTeam {
  tempId: string;
  name: string;
  stage_id?: ScoutStageId | null;
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
}

export interface SeparateDistributionConfig {
  stageTeamCounts: Record<ScoutStageId, number>;
  stageTeamNames?: Partial<Record<ScoutStageId, string[]>>;
  seed?: string;
}

// Scout Adventure Default Team Names & Colors
export const DEFAULT_TEAM_TEMPLATES = [
  { name: 'فريق النسور', icon: 'compass', color: '#173C32' },
  { name: 'فريق الفهود', icon: 'zap', color: '#23836B' },
  { name: 'فريق الذئاب', icon: 'shield', color: '#E89B50' },
  { name: 'فريق الصقور', icon: 'wind', color: '#24342E' },
  { name: 'فريق الأسود', icon: 'flame', color: '#B45309' },
  { name: 'فريق الوعول', icon: 'mountain', color: '#047857' },
  { name: 'فريق الفرسان', icon: 'sword', color: '#4338CA' },
  { name: 'فريق النجوم', icon: 'star', color: '#D97706' },
];

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
 * Generate Mixed-Stage Balanced Teams (Mode A)
 * Balances total team size, stage proportions, and commitment levels.
 */
export function generateMixedStageTeams(
  members: Profile[],
  config: MixedDistributionConfig
): DistributionResult {
  const seed = config.seed || Math.random().toString(36).substring(2, 10);
  const rng = createSeededRandom(seed);
  const teamCount = Math.max(1, config.teamCount);

  if (members.length === 0) {
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
        imbalanceReport: 'لا يوجد أعضاء مؤهلين للتوزيع',
      },
    };
  }

  // Deduplicate members by id
  const uniqueMembersMap = new Map<string, Profile>();
  for (const m of members) {
    if (!uniqueMembersMap.has(m.id)) {
      uniqueMembersMap.set(m.id, m);
    }
  }
  const uniqueMembers = Array.from(uniqueMembersMap.values());

  // Initialize Teams
  const teams: GeneratedTeam[] = [];
  for (let i = 0; i < teamCount; i++) {
    const template = DEFAULT_TEAM_TEMPLATES[i % DEFAULT_TEAM_TEMPLATES.length];
    const customName = config.teamNames?.[i];
    teams.push({
      tempId: `team_mixed_${i + 1}`,
      name: customName?.trim() || `${template.name} ${i >= DEFAULT_TEAM_TEMPLATES.length ? i + 1 : ''}`.trim(),
      stage_id: null,
      color_hex: template.color,
      icon_name: template.icon,
      members: [],
    });
  }

  // Stratify members by: stage_id + commitment
  // This guarantees each stage and commitment status is evenly distributed across all teams
  const strataMap = new Map<string, Profile[]>();
  for (const member of uniqueMembers) {
    const key = `${member.stage_id || 'unknown'}__${member.initial_commitment || 'committed'}`;
    if (!strataMap.has(key)) {
      strataMap.set(key, []);
    }
    strataMap.get(key)!.push(member);
  }

  // Round-robin distribution pointer to avoid bias toward team 0
  let teamPointer = 0;

  // Process strata ordered by stage priority to evenly weave them
  const sortedKeys = Array.from(strataMap.keys()).sort();

  for (const key of sortedKeys) {
    const stratumMembers = seededShuffle(strataMap.get(key)!, rng);
    for (const member of stratumMembers) {
      // Find the team with the minimum current members to minimize size variance
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

  // Auto-select patrol leader if not set (preferring stage_3 or committed)
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
      ? `فرق طفيف في عدد الأعضاء (${diff} أعضاء) بسبب عدم قابلية العدد الكلي للقسمة بالتساوي.`
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
 * Generate Stage-Separated Teams (Mode B)
 * Each scout stage generates teams completely independently.
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
    if (!uniqueMembersMap.has(m.id)) {
      uniqueMembersMap.set(m.id, m);
    }
  }
  const uniqueMembers = Array.from(uniqueMembersMap.values());

  const stages: ScoutStageId[] = ['stage_1', 'stage_2', 'stage_3'];
  const stageLabels: Record<ScoutStageId, string> = {
    stage_1: 'الأشبال',
    stage_2: 'الفتيان',
    stage_3: 'المتقدم',
  };

  const allTeams: GeneratedTeam[] = [];
  const unassigned: Profile[] = [];

  for (const stage of stages) {
    const stageMembers = uniqueMembers.filter((m) => m.stage_id === stage);
    const requestedCount = config.stageTeamCounts[stage] || 0;

    if (requestedCount <= 0 || stageMembers.length === 0) {
      if (stageMembers.length > 0 && requestedCount <= 0) {
        unassigned.push(...stageMembers);
      }
      continue;
    }

    const shuffled = seededShuffle(stageMembers, rng);
    const stageTeams: GeneratedTeam[] = [];

    for (let i = 0; i < requestedCount; i++) {
      const template = DEFAULT_TEAM_TEMPLATES[i % DEFAULT_TEAM_TEMPLATES.length];
      const customName = config.stageTeamNames?.[stage]?.[i];
      stageTeams.push({
        tempId: `team_${stage}_${i + 1}`,
        name: customName?.trim() || `${template.name} (${stageLabels[stage]})`,
        stage_id: stage,
        color_hex: template.color,
        icon_name: template.icon,
        members: [],
      });
    }

    // Distribute among stage teams
    for (let i = 0; i < shuffled.length; i++) {
      const targetTeamIndex = i % requestedCount;
      stageTeams[targetTeamIndex].members.push(shuffled[i]);
    }

    // Assign leader
    for (const team of stageTeams) {
      if (team.members.length > 0) {
        const leader =
          team.members.find((m) => m.initial_commitment === 'committed') ||
          team.members[0];
        team.leaderId = leader.id;
      }
    }

    allTeams.push(...stageTeams);
  }

  // Handle members with unassigned stages
  const knownStageMembers = new Set(allTeams.flatMap((t) => t.members.map((m) => m.id)));
  for (const m of uniqueMembers) {
    if (!knownStageMembers.has(m.id)) {
      unassigned.push(m);
    }
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
          ? `يوجد ${unassigned.length} عضو لم يتم تخصيص مرحلة كشفية لهم أو لم يتم تحديد فرق لمرحلتهم.`
          : undefined,
    },
  };
}
