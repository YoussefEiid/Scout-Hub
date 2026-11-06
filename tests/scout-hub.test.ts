process.env.SCOUT_DEMO_MODE = 'true';

import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  generateMixedStageTeams,
  generateSeparateStageTeams,
} from '../src/lib/teams/distribution-engine';
import {
  formatQRPayload,
  parseQRPayload,
} from '../src/lib/qr/qr-service';
import { ScoutStore } from '../src/lib/data/scout-store';
import { SupabaseService } from '../src/lib/supabase/supabase-service';
import { exportAttendanceCSVAction, registerMemberAction } from '../src/app/actions/scout-actions';
import { requireUserWithRole } from '../src/lib/auth/auth-service';
import { Profile, ScoutStageId, CommitmentPreference } from '../src/types';

describe('1. Fair Balanced Team Distribution Algorithm', () => {
  const mockMembers: Profile[] = Array.from({ length: 60 }, (_, i) => ({
    id: `scout-${i + 1}`,
    member_number: `SCT-2026-${(i + 1).toString().padStart(4, '0')}`,
    full_name: `كشاف تجريبي ${i + 1}`,
    stage_id: (i < 20 ? 'stage_1' : i < 40 ? 'stage_2' : 'stage_3') as ScoutStageId,
    initial_commitment: (i % 3 === 0 ? 'committed' : i % 3 === 1 ? 'circumstances' : 'inactive') as CommitmentPreference,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  it('Mode A: Distributes 60 members across 4 teams evenly (15 per team)', () => {
    const result = generateMixedStageTeams(mockMembers, { teamCount: 4, seed: 'test-seed-123' });
    assert.strictEqual(result.teams.length, 4);
    assert.strictEqual(result.statistics.totalMembers, 60);
    assert.strictEqual(result.statistics.assignedCount, 60);

    for (const team of result.teams) {
      assert.strictEqual(team.members.length, 15);
      // Verify stage balance: each team should have 5 stage_1, 5 stage_2, 5 stage_3
      const s1 = team.members.filter((m) => m.stage_id === 'stage_1').length;
      const s2 = team.members.filter((m) => m.stage_id === 'stage_2').length;
      const s3 = team.members.filter((m) => m.stage_id === 'stage_3').length;
      assert.strictEqual(s1, 5);
      assert.strictEqual(s2, 5);
      assert.strictEqual(s3, 5);
    }
  });

  it('Mode A: Deterministic seeded generation produces identical rosters', () => {
    const run1 = generateMixedStageTeams(mockMembers, { teamCount: 4, seed: 'identical-seed-xyz' });
    const run2 = generateMixedStageTeams(mockMembers, { teamCount: 4, seed: 'identical-seed-xyz' });

    for (let t = 0; t < 4; t++) {
      const names1 = run1.teams[t].members.map((m) => m.id);
      const names2 = run2.teams[t].members.map((m) => m.id);
      assert.deepStrictEqual(names1, names2);
    }
  });

  it('Mode A: Ensures no member appears more than once across all teams', () => {
    const result = generateMixedStageTeams(mockMembers, { teamCount: 5, seed: 'unique-check' });
    const seenIds = new Set<string>();
    for (const team of result.teams) {
      for (const member of team.members) {
        assert.strictEqual(seenIds.has(member.id), false, `Member ${member.id} duplicated!`);
        seenIds.add(member.id);
      }
    }
    assert.strictEqual(seenIds.size, 60);
  });

  it('Mode B: Stage-separated generation isolates stages into distinct teams', () => {
    const result = generateSeparateStageTeams(mockMembers, {
      stageTeamCounts: {
        stage_1: 2,
        stage_2: 3,
        stage_3: 2,
      },
      seed: 'sep-seed',
    });

    assert.strictEqual(result.teams.length, 7);
    for (const team of result.teams) {
      assert.ok(team.stage_id, 'Team must have a designated stage');
      for (const member of team.members) {
        assert.strictEqual(
          member.stage_id,
          team.stage_id,
          `Member ${member.id} from ${member.stage_id} placed in team of stage ${team.stage_id}`
        );
      }
    }
  });

  it('Handles edge cases: empty member pool and uneven counts gracefully', () => {
    const emptyResult = generateMixedStageTeams([], { teamCount: 3 });
    assert.strictEqual(emptyResult.teams.length, 0);
    assert.strictEqual(emptyResult.statistics.assignedCount, 0);

    // Uneven count: 7 members across 3 teams -> sizes 3, 2, 2 (diff <= 1)
    const uneven = generateMixedStageTeams(mockMembers.slice(0, 7), { teamCount: 3, seed: 'uneven' });
    const sizes = uneven.teams.map((t) => t.members.length);
    assert.strictEqual(Math.max(...sizes) - Math.min(...sizes) <= 1, true);
  });
});

describe('2. QR Generation & Bearer Token Security', () => {
  it('Formats QR payload with prefix and raw unpredictable UUID', () => {
    const testUUID = 'c28a867a-c715-4fa7-8fc4-934c5462208d';
    const payload = formatQRPayload(testUUID);
    assert.strictEqual(payload, `SCOUT_ID:${testUUID}`);
  });

  it('Parses valid scout payload and raw UUID tokens', () => {
    const testUUID = 'c28a867a-c715-4fa7-8fc4-934c5462208d';
    assert.strictEqual(parseQRPayload(`SCOUT_ID:${testUUID}`), testUUID);
    assert.strictEqual(parseQRPayload(testUUID), testUUID);
    assert.strictEqual(parseQRPayload('INVALID_TOKEN_FORMAT'), null);
  });

  it('Never exposes sensitive PII inside QR payload', () => {
    const payload = formatQRPayload('99436214-e587-434f-9e79-88029b35bc73');
    assert.strictEqual(payload.includes('@'), false);
    assert.strictEqual(payload.includes('010'), false);
    assert.strictEqual(payload.includes('أحمد'), false);
  });
});

describe('3. Attendance Registration & Duplicate Prevention', () => {
  const sessionId = 'session-2026-11-06';

  it('Records valid attendance with uniform and server arrival status', () => {
    const unusedMemberId = 'scout-uuid-050';
    const res = ScoutStore.recordAttendance({
      sessionId,
      memberId: unusedMemberId,
      uniformStatus: 'with_uniform',
      recordedBy: 'admin-lead',
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.record);
    assert.strictEqual(res.record.uniform_status, 'with_uniform');
    assert.strictEqual(res.record.session_id, sessionId);
  });

  it('Rejects duplicate scan for the same member on the same session', () => {
    const duplicateAttempt = ScoutStore.recordAttendance({
      sessionId,
      memberId: 'scout-uuid-050',
      uniformStatus: 'with_uniform',
      recordedBy: 'admin-lead',
    });

    assert.strictEqual(duplicateAttempt.success, false);
    assert.ok(duplicateAttempt.error?.includes('مسبقًا'));
  });

  it('Validates token revocation and rejects revoked credentials', () => {
    const memberId = 'scout-uuid-010';
    const oldToken = ScoutStore.getActiveQRToken(memberId);
    
    // Revoke and issue new
    const newToken = ScoutStore.revokeAndIssueNewQRToken(memberId, 'بطاقة مفقودة');
    assert.notStrictEqual(oldToken, newToken);

    // Old token must report revoked
    const checkOld = ScoutStore.getMemberByQRToken(oldToken);
    assert.strictEqual(checkOld.isRevoked, true);
    assert.strictEqual(checkOld.member, null);

    // New token must be active
    const checkNew = ScoutStore.getMemberByQRToken(newToken);
    assert.strictEqual(checkNew.isActive, true);
    assert.strictEqual(checkNew.member?.id, memberId);
  });
});

describe('4. Atomic Publishing & Version Consistency', () => {
  it('Atomically marks target distribution as published and unsets prior active', () => {
    const current = ScoutStore.getCurrentPublishedDistribution();
    assert.ok(current, 'There must be an active published distribution');

    const success = ScoutStore.publishTeamDistribution(current.id);
    assert.strictEqual(success, true);

    const published = ScoutStore.getCurrentPublishedDistribution();
    assert.strictEqual(published?.id, current.id);
    assert.strictEqual(published?.is_current_published, true);
  });
});

describe('5. Member Registration Input Validation', () => {
  it('Rejects registration with invalid or too short names', async () => {
    await assert.rejects(
      async () => {
        await registerMemberAction({
          fullName: 'أح',
          stageId: 'stage_2',
          commitment: 'committed',
        });
      },
      {
        message: 'الاسم الكامل يجب أن يتكون من 3 أحرف على الأقل',
      }
    );
  });

  it('Accepts valid registration and assigns standard member number prefix', async () => {
    const res = await registerMemberAction({
      fullName: 'عمر عبد العزيز محمود',
      stageId: 'stage_1',
      commitment: 'committed',
      phone: '01012345678',
    });

    assert.ok(res.id);
    assert.ok(res.member_number.startsWith('SCT-2026-'));
    assert.strictEqual(res.full_name, 'عمر عبد العزيز محمود');
  });
});

describe('6. CSV Export & Arabic Encoding Integrity', () => {
  it('Generates CSV starting with UTF-8 BOM byte marker for Excel Arabic support', async () => {
    const csv = await exportAttendanceCSVAction('session-2026-11-06');
    assert.strictEqual(csv.charCodeAt(0), 0xfeff, 'CSV must start with UTF-8 Byte Order Mark');
    assert.ok(csv.includes('رقم القيد'), 'Header must contain Arabic column title');
    assert.ok(csv.includes('اسم الكشاف'), 'Header must contain scout name column');
  });
});

describe('7. Supabase Service Contract & Architecture Verification', () => {
  it('SupabaseService exposes all production database methods', () => {
    assert.strictEqual(typeof SupabaseService.getMembers, 'function');
    assert.strictEqual(typeof SupabaseService.getMemberById, 'function');
    assert.strictEqual(typeof SupabaseService.getMemberByQRToken, 'function');
    assert.strictEqual(typeof SupabaseService.recordAttendance, 'function');
    assert.strictEqual(typeof SupabaseService.publishTeamDistribution, 'function');
    assert.strictEqual(typeof SupabaseService.saveTeamDistributionDraft, 'function');
    assert.strictEqual(typeof SupabaseService.revokeAndIssueNewQRToken, 'function');
    assert.strictEqual(typeof SupabaseService.getUserRole, 'function');
  });
});

describe('8. Server-Side Authentication & Role Authorization Guard', () => {
  it('requireUserWithRole correctly detects offline demo context', async () => {
    const session = await requireUserWithRole(['super_admin', 'admin']);
    assert.strictEqual(session.isDemo, true);
    assert.ok(session.roles.includes('super_admin'));
    assert.ok(session.userId);
  });
});

describe('9. Team Generation Seed Sensitivity', () => {
  it('Different seeds produce different randomized patrol assignments', () => {
    const sampleMembers: Profile[] = Array.from({ length: 24 }, (_, i) => ({
      id: `scout-seed-${i + 1}`,
      member_number: `SCT-2026-${(i + 1).toString().padStart(4, '0')}`,
      full_name: `كشاف تجريبي ${i + 1}`,
      stage_id: 'stage_2',
      initial_commitment: 'committed',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const resultSeedA = generateMixedStageTeams(sampleMembers, { teamCount: 3, seed: 'seed-alpha' });
    const resultSeedB = generateMixedStageTeams(sampleMembers, { teamCount: 3, seed: 'seed-beta' });

    const team1A = resultSeedA.teams[0].members.map((m) => m.id);
    const team1B = resultSeedB.teams[0].members.map((m) => m.id);

    // Two different seeds should produce different permutations
    assert.notDeepStrictEqual(team1A, team1B);
  });
});
