import assert from 'node:assert';
import { describe, it } from 'node:test';
import { generateMixedStageTeams, generateSeparateStageTeams, isEligibleScout } from '@/lib/teams/distribution-engine';
import { normalizePhoneNumber } from '@/lib/auth/registration';
import { getSectionDisplayName, getSectionYearDisplayName, getFullScoutScopeDisplay } from '@/lib/sections/section-helper';
import { Profile } from '@/types';

function makeMockProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'mock-' + Math.random().toString(36).substring(2, 9),
    member_number: 'SCT-2026-0001',
    full_name: 'كشاف اختبار',
    stage_id: 'stage_1',
    initial_commitment: 'committed',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('Team Distribution Engine & Child-Friendly Identity Tests', () => {
  it('1. Handles empty eligible members pool gracefully without crashing', () => {
    const resMixed = generateMixedStageTeams([], { teamCount: 4 });
    assert.strictEqual(resMixed.teams.length, 0);
    assert.strictEqual(resMixed.statistics.totalMembers, 0);
    assert.ok(resMixed.statistics.imbalanceReport);

    const resSeparate = generateSeparateStageTeams([], {});
    assert.strictEqual(resSeparate.teams.length, 0);
    assert.strictEqual(resSeparate.statistics.totalMembers, 0);
  });

  it('2. Mode A (Mixed) stratifies by dynamic section and balances across requested teams', () => {
    const members: Profile[] = [
      makeMockProfile({ id: 'm1', section_id: 'sec-a', initial_commitment: 'committed' }),
      makeMockProfile({ id: 'm2', section_id: 'sec-a', initial_commitment: 'circumstances' }),
      makeMockProfile({ id: 'm3', section_id: 'sec-b', initial_commitment: 'committed' }),
      makeMockProfile({ id: 'm4', section_id: 'sec-b', initial_commitment: 'circumstances' }),
      makeMockProfile({ id: 'm5', section_id: 'sec-a', initial_commitment: 'committed' }),
      makeMockProfile({ id: 'm6', section_id: 'sec-b', initial_commitment: 'committed' }),
    ];

    const res = generateMixedStageTeams(members, { teamCount: 2, seed: 'fixed-seed-42' });
    assert.strictEqual(res.teams.length, 2);
    assert.strictEqual(res.teams[0].members.length, 3);
    assert.strictEqual(res.teams[1].members.length, 3);
    assert.strictEqual(res.statistics.assignedCount, 6);
  });

  it('3. Mode B (Separate) groups members by dynamic section and assigns team sectionId', () => {
    const sec1 = 'sec-cubs-uuid';
    const sec2 = 'sec-scouts-uuid';

    const mockSec1 = { id: sec1, name: 'فريق كشافة', code: 'scouts', icon: 'compass', color_theme: '#23836B', display_order: 1, is_active: true, created_at: '', updated_at: '' };
    const mockSec2 = { id: sec2, name: 'فريق مرشدات', code: 'guides', icon: 'shield', color_theme: '#E89B50', display_order: 2, is_active: true, created_at: '', updated_at: '' };

    const members: Profile[] = [
      makeMockProfile({ id: 'm1', section_id: sec1, section: mockSec1 }),
      makeMockProfile({ id: 'm2', section_id: sec1, section: mockSec1 }),
      makeMockProfile({ id: 'm3', section_id: sec2, section: mockSec2 }),
      makeMockProfile({ id: 'm4', section_id: sec2, section: mockSec2 }),
    ];

    const res = generateSeparateStageTeams(members, {
      sectionTeamCounts: { [sec1]: 1, [sec2]: 1 },
      seed: 'test-seed-separate',
    });

    assert.strictEqual(res.teams.length, 2);
    const team1 = res.teams.find((t) => t.section_id === sec1);
    const team2 = res.teams.find((t) => t.section_id === sec2);

    assert.ok(team1, 'Must create team for section 1');
    assert.ok(team2, 'Must create team for section 2');
    assert.strictEqual(team1?.members.length, 2);
    assert.strictEqual(team2?.members.length, 2);
  });

  it('4. isEligibleScout strictly filters staff and inactive members', () => {
    const activeMember = makeMockProfile({ is_active: true, roles: ['member'] });
    const inactiveMember = makeMockProfile({ is_active: false, roles: ['member'] });
    const superAdmin = makeMockProfile({ is_active: true, roles: ['super_admin'] });
    const sectionLeader = makeMockProfile({ is_active: true, roles: ['section_leader'] });
    const assistant = makeMockProfile({ is_active: true, roles: ['assistant_leader'] });

    assert.strictEqual(isEligibleScout(activeMember), true);
    assert.strictEqual(isEligibleScout(inactiveMember), false);
    assert.strictEqual(isEligibleScout(superAdmin), false);
    assert.strictEqual(isEligibleScout(sectionLeader), false);
    assert.strictEqual(isEligibleScout(assistant), false);
  });

  it('5. normalizePhoneNumber handles Egyptian mobile formats correctly', () => {
    assert.strictEqual(normalizePhoneNumber('01012345678'), '+201012345678');
    assert.strictEqual(normalizePhoneNumber('011 2345 6789'), '+201123456789');
    assert.strictEqual(normalizePhoneNumber('012-3456-7890'), '+201234567890');
    assert.strictEqual(normalizePhoneNumber('01512345678'), '+201512345678');
    assert.strictEqual(normalizePhoneNumber('+201012345678'), '+201012345678');
  });

  it('6. Dynamic section and year display helpers reflect DB names with official fallback', () => {
    // Unassigned member
    const unassigned = makeMockProfile({ section: undefined, year: undefined, stage_id: undefined as any });
    assert.strictEqual(getSectionDisplayName(unassigned), 'لم يتم تحديد القسم أو السنة الكشفية بعد');
    assert.strictEqual(getFullScoutScopeDisplay(unassigned), 'لم يتم تحديد القسم أو السنة الكشفية بعد');

    // Section only
    const sectionOnly = makeMockProfile({
      section: { id: 's1', name: 'فريق كشافة', code: 'scouts', icon: 'compass', color_theme: '#23836B', display_order: 1, is_active: true, created_at: '', updated_at: '' },
    });
    assert.strictEqual(getSectionDisplayName(sectionOnly), 'فريق كشافة');
    assert.strictEqual(getFullScoutScopeDisplay(sectionOnly), 'فريق كشافة');

    // Section + Year
    const fullScope = makeMockProfile({
      section: { id: 's1', name: 'فريق كشافة', code: 'scouts', icon: 'compass', color_theme: '#23836B', display_order: 1, is_active: true, created_at: '', updated_at: '' },
      year: { id: 'y1', section_id: 's1', name: 'سنة ثانية', display_order: 2, is_active: true, created_at: '', updated_at: '' },
    });
    assert.strictEqual(getSectionDisplayName(fullScope), 'فريق كشافة');
    assert.strictEqual(getSectionYearDisplayName(fullScope), 'سنة ثانية');
    assert.strictEqual(getFullScoutScopeDisplay(fullScope), 'فريق كشافة — سنة ثانية');
  });
});
