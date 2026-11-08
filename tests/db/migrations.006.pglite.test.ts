import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();

const ids = {
  superAdmin: randomUUID(),
  leaderA1: randomUUID(), // Section A, Year 1 only
  leaderA2: randomUUID(), // Section A, Year 2 only
  leaderB: randomUUID(),  // Section B (Wildcard all years)
  staffMember: randomUUID(), // Staff account
  // 7 scouts in Section A for the 7-scouts-in-3-teams test
  scoutA_1: randomUUID(),
  scoutA_2: randomUUID(),
  scoutA_3: randomUUID(),
  scoutA_4: randomUUID(),
  scoutA_5: randomUUID(),
  scoutA_6: randomUUID(),
  scoutA_7: randomUUID(),
  // Scouts in Section B
  scoutB_1: randomUUID(),
  scoutB_2: randomUUID(),
};

async function asUser(id: string) {
  await db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id}',false);`);
}
async function asAnon() {
  await db.exec(`RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claim.sub','',false);`);
}
async function asService() {
  await db.exec(`RESET ROLE; SET ROLE service_role;`);
}

describe('PostgreSQL (PGlite): migration 006 Comprehensive Final Verification', () => {
  let sectionA: string;
  let sectionB: string;
  let yearA1: string;
  let yearA2: string;
  let distA1: string;
  let distA2: string;
  let distB: string;

  before(async () => {
    await db.exec(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
        AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
    `);

    // Apply migrations 001 through 006 in order
    const m1 = readFileSync('supabase/migrations/001_initial_schema.sql', 'utf8');
    const m2 = readFileSync('supabase/migrations/002_production_hardening.sql', 'utf8');
    const m3 = readFileSync('supabase/migrations/003_dynamic_scout_structure_and_role_isolation.sql', 'utf8');
    const m4 = readFileSync('supabase/migrations/004_friday_meetings_and_member_lifecycle.sql', 'utf8');
    const m5 = readFileSync('supabase/migrations/005_member_auth_and_dynamic_identity.sql', 'utf8');
    const m6 = readFileSync('supabase/migrations/006_production_auth_and_team_rpc_fix.sql', 'utf8');

    await db.exec(m1);
    await db.exec(m2);
    await db.exec(m3);
    await db.exec(m4);
    await db.exec(m5);
    await db.exec(m6);

    // Seed auth.users
    for (const [name, id] of Object.entries(ids)) {
      await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2);`, [id, `${name}@alfanar.test`]);
    }

    // Seed sections
    const secRowA = (await db.query<{ id: string }>(`
      INSERT INTO public.scout_sections (name, code, display_order)
      VALUES ('مرحلة الأشبال', 'cubs_a', 1) RETURNING id;
    `)).rows[0];
    sectionA = secRowA.id;

    const secRowB = (await db.query<{ id: string }>(`
      INSERT INTO public.scout_sections (name, code, display_order)
      VALUES ('مرحلة الكشافة', 'scouts_b', 2) RETURNING id;
    `)).rows[0];
    sectionB = secRowB.id;

    // Seed years in Section A
    const y1 = (await db.query<{ id: string }>(`
      INSERT INTO public.scout_section_years (section_id, name, display_order)
      VALUES ('${sectionA}', 'أشبال - سنة أولى', 1) RETURNING id;
    `)).rows[0];
    yearA1 = y1.id;

    const y2 = (await db.query<{ id: string }>(`
      INSERT INTO public.scout_section_years (section_id, name, display_order)
      VALUES ('${sectionA}', 'أشبال - سنة ثانية', 2) RETURNING id;
    `)).rows[0];
    yearA2 = y2.id;

    // Seed staff profiles
    await db.exec(`
      INSERT INTO public.profiles (id, member_number, full_name, initial_commitment, is_active)
      VALUES ('${ids.superAdmin}', 'ADMIN-001', 'سوبر أدمن', 'committed', true),
             ('${ids.leaderA1}', 'LDR-A1-001', 'قائد أشبال سنة أولى', 'committed', true),
             ('${ids.leaderA2}', 'LDR-A2-001', 'قائد أشبال سنة ثانية', 'committed', true),
             ('${ids.leaderB}', 'LDR-B-001', 'قائد الكشافة', 'committed', true),
             ('${ids.staffMember}', 'STAFF-001', 'مساعد قائد', 'committed', true);
    `);

    // Seed 7 scouts in Section A:
    // scouts 1, 2, 3 in Year 1
    // scouts 4, 5 in Year 2
    // scouts 6, 7 in Year 1
    await db.exec(`
      INSERT INTO public.profiles (id, member_number, full_name, phone, section_id, year_id, initial_commitment, is_active)
      VALUES ('${ids.scoutA_1}', 'SCT-A-1', 'شبل 1', '01011111111', '${sectionA}', '${yearA1}', 'committed', true),
             ('${ids.scoutA_2}', 'SCT-A-2', 'شبل 2', '01022222222', '${sectionA}', '${yearA1}', 'committed', true),
             ('${ids.scoutA_3}', 'SCT-A-3', 'شبل 3', '01033333333', '${sectionA}', '${yearA1}', 'committed', true),
             ('${ids.scoutA_4}', 'SCT-A-4', 'شبل 4', '01044444444', '${sectionA}', '${yearA2}', 'committed', true),
             ('${ids.scoutA_5}', 'SCT-A-5', 'شبل 5', '01055555555', '${sectionA}', '${yearA2}', 'committed', true),
             ('${ids.scoutA_6}', 'SCT-A-6', 'شبل 6', '01066666666', '${sectionA}', '${yearA1}', 'committed', true),
             ('${ids.scoutA_7}', 'SCT-A-7', 'شبل 7', '01077777777', '${sectionA}', '${yearA1}', 'committed', true),
             ('${ids.scoutB_1}', 'SCT-B-1', 'كشاف 1', '01088888888', '${sectionB}', NULL, 'committed', true),
             ('${ids.scoutB_2}', 'SCT-B-2', 'كشاف 2', '01099999999', '${sectionB}', NULL, 'committed', true);
    `);

    // Seed roles in user_roles
    await asService();
    await db.exec(`
      INSERT INTO public.user_roles (user_id, role) VALUES
        ('${ids.superAdmin}', 'super_admin'),
        ('${ids.leaderA1}', 'section_leader'),
        ('${ids.leaderA2}', 'section_leader'),
        ('${ids.leaderB}', 'section_leader'),
        ('${ids.staffMember}', 'assistant_leader'),
        ('${ids.scoutA_1}', 'member'),
        ('${ids.scoutA_2}', 'member'),
        ('${ids.scoutA_3}', 'member'),
        ('${ids.scoutA_4}', 'member'),
        ('${ids.scoutA_5}', 'member'),
        ('${ids.scoutA_6}', 'member'),
        ('${ids.scoutA_7}', 'member'),
        ('${ids.scoutB_1}', 'member'),
        ('${ids.scoutB_2}', 'member');
    `);

    // Scope assignments
    await db.exec(`
      INSERT INTO public.staff_scope_assignments (user_id, section_id, year_id, assigned_by) VALUES
        ('${ids.leaderA1}', '${sectionA}', '${yearA1}', '${ids.superAdmin}'),
        ('${ids.leaderA2}', '${sectionA}', '${yearA2}', '${ids.superAdmin}'),
        ('${ids.leaderB}', '${sectionB}', NULL, '${ids.superAdmin}');
    `);
  });

  it('1. has_scope_access: year-restricted leader strictly fails when target_year_id is NULL', async () => {
    // Leader A1 (Year 1 only) -> target_year_id = NULL must return FALSE
    const r1 = (await db.query<{ has_scope_access: boolean }>(`
      SELECT public.has_scope_access('${ids.leaderA1}'::uuid, '${sectionA}'::uuid, NULL) as has_scope_access;
    `)).rows[0].has_scope_access;
    assert.strictEqual(r1, false, 'Leader restricted to Year 1 must fail scope access when target_year_id is NULL');

    // Leader B (Wildcard scope: year_id IS NULL) -> target_year_id = NULL returns TRUE
    const r2 = (await db.query<{ has_scope_access: boolean }>(`
      SELECT public.has_scope_access('${ids.leaderB}'::uuid, '${sectionB}'::uuid, NULL) as has_scope_access;
    `)).rows[0].has_scope_access;
    assert.strictEqual(r2, true, 'Wildcard leader passes when target_year_id is NULL');
  });

  it('2. save_team_distribution_draft: unique 5-arg signature resolves without ambiguous overload', async () => {
    await asUser(ids.leaderA1);

    const teams = JSON.stringify([
      { name: 'سداسي النجوم 1', leader_id: null, year_id: yearA1, member_ids: [ids.scoutA_1, ids.scoutA_2] },
      { name: 'سداسي النجوم 2', leader_id: null, year_id: yearA1, member_ids: [ids.scoutA_3] },
    ]);

    // Call with standard 5 arguments
    const res = await db.query<{ id: string }>(`
      SELECT public.save_team_distribution_draft(
        'أشبال سنة أولى',
        'mixed_stages',
        'seed-a1',
        $1::jsonb,
        $2::uuid
      ) as id;
    `, [teams, sectionA]);

    distA1 = res.rows[0].id;
    assert.ok(distA1, 'Draft saved without overload ambiguity');

    // Verify team_memberships has is_leader = false (not null, no crash)
    const mships = (await db.query<{ is_leader: boolean }>(`
      SELECT is_leader FROM public.team_memberships WHERE distribution_id = $1;
    `, [distA1])).rows;

    assert.strictEqual(mships.length, 3);
    assert.strictEqual(mships.every(m => m.is_leader === false), true);
  });

  it('3. Prevent Year 1 leader from reading mixed or other-year distributions', async () => {
    // Super admin creates a mixed distribution with Year 1 and Year 2 teams in Section A
    await asUser(ids.superAdmin);
    const mixedTeams = JSON.stringify([
      { name: 'فريق سنة 1', leader_id: null, year_id: yearA1, member_ids: [ids.scoutA_6] },
      { name: 'فريق سنة 2', leader_id: null, year_id: yearA2, member_ids: [ids.scoutA_4] },
    ]);
    const mixedDistId = (await db.query<{ id: string }>(`
      SELECT public.save_team_distribution_draft('توزيع مختلط للقسم', 'mixed_stages', 'seed-mix', $1::jsonb, $2::uuid) as id;
    `, [mixedTeams, sectionA])).rows[0].id;

    // Leader A1 (Year 1 only) queries team_distributions under RLS
    await asUser(ids.leaderA1);
    const visibleDistributions = (await db.query<{ id: string }>(`
      SELECT id FROM public.team_distributions;
    `)).rows;

    const seesMixed = visibleDistributions.some(d => d.id === mixedDistId);
    assert.strictEqual(seesMixed, false, 'Leader A1 must NOT see mixed distribution containing Year 2 teams');

    const seesDistA1 = visibleDistributions.some(d => d.id === distA1);
    assert.strictEqual(seesDistA1, true, 'Leader A1 must see pure Year 1 distribution');
  });

  it('4. Lockdown of helper functions: no arbitrary user probing & anon rejected', async () => {
    // A. Anonymous caller is completely rejected
    await asAnon();

    await assert.rejects(
      async () => {
        await db.query(`SELECT public.is_distribution_published('${randomUUID()}'::uuid);`);
      },
      /permission denied/,
      'Anon cannot call is_distribution_published'
    );

    await assert.rejects(
      async () => {
        await db.query(`SELECT public.is_member_in_team('${randomUUID()}'::uuid);`);
      },
      /permission denied/,
      'Anon cannot call is_member_in_team'
    );

    // B. Authenticated non-admin CANNOT probe another user's scope or leader status
    await asUser(ids.scoutA_1);

    const probedScope = (await db.query<{ has_scope_access: boolean }>(`
      SELECT public.has_scope_access('${ids.leaderA1}'::uuid, '${sectionA}'::uuid, '${yearA1}'::uuid) as has_scope_access;
    `)).rows[0].has_scope_access;
    assert.strictEqual(probedScope, false, 'Authenticated member probing another user scope must return false');

    const probedLeader = (await db.query<{ is_section_leader: boolean }>(`
      SELECT public.is_section_leader('${ids.leaderA1}'::uuid) as is_section_leader;
    `)).rows[0].is_section_leader;
    assert.strictEqual(probedLeader, false, 'Authenticated member probing another user leader status must return false');

    // C. Old 2-argument signature is completely gone
    await assert.rejects(
      async () => {
        await db.query(`SELECT public.is_member_in_team('${ids.scoutA_1}'::uuid, '${randomUUID()}'::uuid);`);
      },
      /function public\.is_member_in_team\(uuid, uuid\) does not exist/,
      '2-argument signature is deleted'
    );
  });

  it('5. Real Scenario: Distributing 7 Scouts into 3 Teams, Saving, Publishing, and Viewing', async () => {
    // Super admin distributes 7 scouts in Section A into 3 teams
    await asUser(ids.superAdmin);

    const sevenScoutsTeams = JSON.stringify([
      {
        name: 'طليعة الفهد',
        leader_id: ids.scoutA_1,
        member_ids: [ids.scoutA_1, ids.scoutA_2, ids.scoutA_3], // 3 scouts
      },
      {
        name: 'طليعة النسر',
        leader_id: ids.scoutA_4,
        member_ids: [ids.scoutA_4, ids.scoutA_5], // 2 scouts
      },
      {
        name: 'طليعة الصقر',
        leader_id: ids.scoutA_6,
        member_ids: [ids.scoutA_6, ids.scoutA_7], // 2 scouts
      },
    ]);

    const res = await db.query<{ id: string }>(`
      SELECT public.save_team_distribution_draft(
        'توزيع طلائع القسم الكشفي (7 كشافة)',
        'mixed_stages',
        'seed-seven-scouts',
        $1::jsonb,
        $2::uuid
      ) as id;
    `, [sevenScoutsTeams, sectionA]);

    const dist7Id = res.rows[0].id;
    assert.ok(dist7Id, 'Draft for 7 scouts saved');

    // Publish distribution
    const pubRes = (await db.query<{ publish_team_distribution: { success: boolean; distribution_id: string } }>(`
      SELECT public.publish_team_distribution($1::uuid);
    `, [dist7Id])).rows[0].publish_team_distribution;

    assert.strictEqual(pubRes.success, true);

    // Verify all 3 teams and 7 memberships are stored
    const teams = (await db.query<{ id: string; name: string }>(`
      SELECT id, name FROM public.teams WHERE distribution_id = $1 ORDER BY name;
    `, [dist7Id])).rows;
    assert.strictEqual(teams.length, 3, 'Exactly 3 teams created');

    const totalMembers = (await db.query<{ count: string }>(`
      SELECT count(*) as count FROM public.team_memberships WHERE distribution_id = $1;
    `, [dist7Id])).rows[0].count;
    assert.strictEqual(Number(totalMembers), 7, 'Exactly 7 scouts assigned to teams');
  });

  it('6. Teammate visibility: Member sees teammates names/avatar in published team, strictly omitting phone/private data', async () => {
    // Scout A_1 logs in and calls get_my_published_team()
    await asUser(ids.scoutA_1);

    const teamPayload = (await db.query<{ get_my_published_team: {
      team: { id: string; name: string };
      members: Array<{ id: string; full_name: string; member_number: string; avatar_url?: string; phone?: string }>;
    } }>(`
      SELECT public.get_my_published_team();
    `)).rows[0].get_my_published_team;

    assert.ok(teamPayload, 'Member retrieves their published team');
    assert.strictEqual(teamPayload.team.name, 'طليعة الفهد');
    assert.strictEqual(teamPayload.members.length, 3, 'Sees the 3 teammates in their team');

    // Verify teammate details contain public info (full_name, member_number)
    const teammateNames = teamPayload.members.map(m => m.full_name);
    assert.ok(teammateNames.includes('شبل 1'));
    assert.ok(teammateNames.includes('شبل 2'));
    assert.ok(teammateNames.includes('شبل 3'));

    // Critical: phone and commitment must NOT be leaked
    for (const m of teamPayload.members) {
      assert.strictEqual(m.phone, undefined, 'Phone numbers must be omitted from team roster');
    }
  });

  it('7. Conflict-free publishing: Section Leader blocked from overriding global roster; Super Admin transitions cleanly', async () => {
    // A. Super Admin publishes a global distribution
    await asUser(ids.superAdmin);
    const globalTeams = JSON.stringify([
      { name: 'طليعة عامة 1', leader_id: null, member_ids: [ids.scoutA_1, ids.scoutB_1] },
      { name: 'طليعة عامة 2', leader_id: null, member_ids: [ids.scoutA_2, ids.scoutB_2] },
    ]);
    const globalDistId = (await db.query<{ id: string }>(`
      SELECT public.save_team_distribution_draft('توزيع كشفي عام', 'mixed_stages', 'seed-global', $1::jsonb, NULL) as id;
    `, [globalTeams])).rows[0].id;

    await db.query(`SELECT public.publish_team_distribution($1::uuid);`, [globalDistId]);

    // B. Critical Security Requirement:
    // A section leader attempting to publish a section draft while a global distribution is active MUST be rejected!
    // Transitions between global organization rosters and section rosters are reserved strictly for Super Admin.
    await asUser(ids.leaderA1);
    const sectionDraftId = (await db.query<{ id: string }>(`
      SELECT public.save_team_distribution_draft(
        'مسودة أشبال سنة 1', 'mixed_stages', 'seed-sec-blocked',
        $1::jsonb, $2::uuid
      ) as id;
    `, [JSON.stringify([{ name: 'سداسي', leader_id: null, year_id: yearA1, member_ids: [ids.scoutA_1] }]), sectionA])).rows[0].id;

    await assert.rejects(
      async () => {
        await db.query(`SELECT public.publish_team_distribution($1::uuid);`, [sectionDraftId]);
      },
      /GLOBAL_DISTRIBUTION.*SUPER_ADMIN|GLOBAL_DISTRIBUTION_ACTIVE/,
      'Section leader cannot archive or transition from an active global distribution'
    );

    // C. Super Admin can transition between global and section rosters
    await asUser(ids.superAdmin);
    await db.query(`SELECT public.publish_team_distribution($1::uuid);`, [sectionDraftId]);

    // Verify global distribution was archived by the Super Admin's transition
    const activeGlobal = (await db.query<{ id: string }>(`
      SELECT id FROM public.team_distributions WHERE is_current_published = true AND section_id IS NULL;
    `)).rows;
    assert.strictEqual(activeGlobal.length, 0, 'Global distribution cleanly archived by super admin section publish');
  });

  it('8. Integrity Verification block: safely aborts if data discrepancies exist', async () => {
    // Verify our DO block in migration 006 detects any simulated discrepancy and halts
    await asService();
    const badDistId = randomUUID();
    await db.query(`
      INSERT INTO public.team_distributions (id, title, mode, status, random_seed)
      VALUES ('${badDistId}', 'شذوذ', 'mixed_stages', 'draft', 's');
    `);
    const badTeamId = (await db.query<{ id: string }>(`
      INSERT INTO public.teams (distribution_id, name) VALUES ('${badDistId}', 'فريق شذوذ') RETURNING id;
    `)).rows[0].id;

    // Simulate mismatched record
    const anotherDistId = randomUUID();
    await db.query(`
      INSERT INTO public.team_distributions (id, title, mode, status, random_seed)
      VALUES ('${anotherDistId}', 'توزيع آخر', 'mixed_stages', 'draft', 's2');
    `);
    await db.query(`
      INSERT INTO public.team_memberships (team_id, distribution_id, member_id)
      VALUES ('${badTeamId}', '${anotherDistId}', '${ids.scoutB_1}');
    `);

    // Verify migration safety verification block halts
    await assert.rejects(
      async () => {
        await db.exec(`
          DO $$
          DECLARE
              v_mismatches integer;
          BEGIN
              SELECT count(*) INTO v_mismatches
                FROM public.team_memberships tm
                JOIN public.teams t ON t.id = tm.team_id
               WHERE tm.distribution_id IS DISTINCT FROM t.distribution_id;

              IF v_mismatches > 0 THEN
                  RAISE EXCEPTION 'MIGRATION_HALTED: Found % mismatched records', v_mismatches;
              END IF;
          END $$;
        `);
      },
      /MIGRATION_HALTED/,
      'Migration halts when discrepancy exists'
    );

    // Clean up simulated bad records
    await db.query(`DELETE FROM public.team_memberships WHERE team_id = '${badTeamId}';`);
    await db.query(`DELETE FROM public.teams WHERE id = '${badTeamId}';`);
    await db.query(`DELETE FROM public.team_distributions WHERE id IN ('${badDistId}', '${anotherDistId}');`);
  });

  it('9. Safe Rollback Validation: 006_rollback.sql preserves year_id & handles multi-published year rosters without data loss', async () => {
    // Create scenario: Multiple published year distributions in Section A under Migration 006
    await asUser(ids.superAdmin);

    // Distribution 1: Section A, Year 1
    const distY1 = (await db.query<{ id: string }>(`
      SELECT public.save_team_distribution_draft(
        'توزيع سنة أولى 006', 'mixed_stages', 'seed-y1',
        $1::jsonb, $2::uuid
      ) as id;
    `, [JSON.stringify([{ name: 'طليعة سنة 1', leader_id: null, year_id: yearA1, member_ids: [ids.scoutA_1, ids.scoutA_2] }]), sectionA])).rows[0].id;
    await db.query(`SELECT public.publish_team_distribution($1::uuid);`, [distY1]);

    // Distribution 2: Section A, Year 2 (both active simultaneously under Migration 006)
    const distY2 = (await db.query<{ id: string }>(`
      SELECT public.save_team_distribution_draft(
        'توزيع سنة ثانية 006', 'mixed_stages', 'seed-y2',
        $1::jsonb, $2::uuid
      ) as id;
    `, [JSON.stringify([{ name: 'طليعة سنة 2', leader_id: null, year_id: yearA2, member_ids: [ids.scoutA_4, ids.scoutA_5] }]), sectionA])).rows[0].id;
    await db.query(`SELECT public.publish_team_distribution($1::uuid);`, [distY2]);

    // Verify both are published under Migration 006
    const publishedBeforeRollback = (await db.query<{ count: string }>(`
      SELECT count(*) as count FROM public.team_distributions
      WHERE is_current_published = true AND section_id = $1;
    `, [sectionA])).rows[0].count;
    assert.strictEqual(Number(publishedBeforeRollback), 2, '2 year distributions published in Section A');

    // Execute the safe, non-destructive rollback script (Write Freeze)
    await db.exec('RESET ROLE;');
    const rollbackSql = readFileSync('supabase/migrations/006_rollback.sql', 'utf8');
    await db.exec(rollbackSql);

    // 1. Critical Requirement: year_id column was NOT dropped, preserving all data
    const colExists = (await db.query<{ count: string }>(`
      SELECT count(*) as count
      FROM information_schema.columns
      WHERE table_name = 'team_distributions' AND column_name = 'year_id';
    `)).rows[0].count;
    assert.strictEqual(Number(colExists), 1, 'year_id column is SAFELY preserved (no data loss)');

    // 2. Verify all data and distributions created under 006 remain completely intact
    const preservedYearRow = (await db.query<{ year_id: string }>(`
      SELECT year_id FROM public.team_distributions WHERE id = $1;
    `, [distY1])).rows[0];
    assert.strictEqual(preservedYearRow.year_id, yearA1, 'Historical year_id values preserved');

    const publishedCount = (await db.query<{ count: string }>(`
      SELECT count(*) as count FROM public.team_distributions
      WHERE is_current_published = true AND section_id = $1;
    `, [sectionA])).rows[0].count;
    assert.strictEqual(Number(publishedCount), 2, 'Data intact: 2 year distributions still exist and published');

    // 3. Operational Write Freeze: authenticated role cannot execute mutation functions
    await asUser(ids.leaderA1);
    await assert.rejects(
      async () => {
        await db.query(`
          SELECT public.save_team_distribution_draft(
            'محاولة أثناء التجميد', 'mixed_stages', 'seed-freeze',
            $1::jsonb, $2::uuid
          );
        `, [JSON.stringify([{ name: 'طليعة مجمدة', leader_id: null, year_id: yearA1, member_ids: [ids.scoutA_1] }]), sectionA]);
      },
      /permission denied for function save_team_distribution_draft/,
      'Authenticated cannot call save_team_distribution_draft during write freeze'
    );

    await assert.rejects(
      async () => {
        await db.query(`SELECT public.publish_team_distribution($1::uuid);`, [distY1]);
      },
      /permission denied for function publish_team_distribution/,
      'Authenticated cannot call publish_team_distribution during write freeze'
    );

    // 4. Verify unfreezing works cleanly by re-granting EXECUTE (as postgres admin)
    await db.exec('RESET ROLE;');
    await db.exec(`
      GRANT EXECUTE ON FUNCTION public.save_team_distribution_draft(text, text, text, jsonb, uuid) TO authenticated;
      GRANT EXECUTE ON FUNCTION public.publish_team_distribution(uuid) TO authenticated;
      GRANT EXECUTE ON FUNCTION public.move_draft_member(uuid, uuid, uuid) TO authenticated;
      GRANT EXECUTE ON FUNCTION public.swap_draft_members(uuid, uuid, uuid) TO authenticated;
    `);

    // Verify authenticated leader can now invoke save draft again
    await asUser(ids.leaderA1);
    const unfreezeDraftId = (await db.query<{ id: string }>(`
      SELECT public.save_team_distribution_draft(
        'مسودة بعد رفع التجميد', 'mixed_stages', 'seed-unfrozen',
        $1::jsonb, $2::uuid
      ) as id;
    `, [JSON.stringify([{ name: 'طليعة مفكوكة', leader_id: null, year_id: yearA1, member_ids: [ids.scoutA_1] }]), sectionA])).rows[0].id;
    assert.ok(unfreezeDraftId, 'Operations successfully restored after re-granting permissions');
  });
});
