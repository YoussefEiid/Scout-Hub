import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();

const ids = {
  superAdmin: randomUUID(),
  adminUser: randomUUID(),
  sectionLeader: randomUUID(),
  scoutMember1: randomUUID(),
  scoutMember2: randomUUID(),
  scoutMember3: randomUUID(),
  scoutMember4: randomUUID(),
  scoutMember5: randomUUID(),
  scoutMember6: randomUUID(),
};

async function asUser(id: string) {
  await db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id}',false);`);
}
async function asService() {
  await db.exec(`RESET ROLE; SET ROLE service_role;`);
}

describe('PostgreSQL (PGlite): migration 006 Production Auth & Team RPC Fix', () => {
  let sectionId: string;
  let otherSectionId: string;

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

    const secRow = (await db.query<{ id: string }>(`
      INSERT INTO public.scout_sections (name, code, display_order)
      VALUES ('فريق كشافة', 'scouts_test', 1) RETURNING id;
    `)).rows[0];
    sectionId = secRow.id;

    const otherSecRow = (await db.query<{ id: string }>(`
      INSERT INTO public.scout_sections (name, code, display_order)
      VALUES ('فريق مرشدات', 'guides_test', 2) RETURNING id;
    `)).rows[0];
    otherSectionId = otherSecRow.id;

    // Create staff profiles
    await db.exec(`
      INSERT INTO public.profiles (id, member_number, full_name, initial_commitment, is_active)
      VALUES ('${ids.superAdmin}', 'ADMIN-TEST-001', 'مدير النظام', 'committed', true),
             ('${ids.sectionLeader}', 'LDR-TEST-001', 'قائد القسم', 'committed', true);
    `);

    // Create member profiles
    const members = [
      ids.scoutMember1, ids.scoutMember2, ids.scoutMember3,
      ids.scoutMember4, ids.scoutMember5, ids.scoutMember6
    ];
    for (let i = 0; i < members.length; i++) {
      await db.exec(`
        INSERT INTO public.profiles (id, member_number, full_name, section_id, initial_commitment, is_active)
        VALUES ('${members[i]}', 'SCT-TEST-00${i + 1}', 'كشاف تجريبي ${i + 1}', '${sectionId}', 'committed', true);
      `);
    }

    // Seed test roles
    await asService();
    await db.exec(`
      INSERT INTO public.user_roles (user_id, role) VALUES
        ('${ids.superAdmin}', 'super_admin'),
        ('${ids.sectionLeader}', 'section_leader'),
        ('${ids.scoutMember1}', 'member'),
        ('${ids.scoutMember2}', 'member'),
        ('${ids.scoutMember3}', 'member'),
        ('${ids.scoutMember4}', 'member'),
        ('${ids.scoutMember5}', 'member'),
        ('${ids.scoutMember6}', 'member');
    `);

    // Scope section leader to sectionId
    await db.exec(`
      INSERT INTO public.staff_scope_assignments (user_id, section_id, assigned_by)
      VALUES ('${ids.sectionLeader}', '${sectionId}', '${ids.superAdmin}');
    `);
  });

  it('1. save_team_distribution_draft succeeds when leader_id IS NULL (NOT NULL constraint is preserved without error)', async () => {
    await asUser(ids.sectionLeader);

    const teamsInput = JSON.stringify([
      {
        name: 'طليعة الفهد',
        leader_id: null, // Critical: NULL leader_id must not crash
        member_ids: [ids.scoutMember1, ids.scoutMember2],
      },
      {
        name: 'طليعة النسر',
        leader_id: null,
        member_ids: [ids.scoutMember3, ids.scoutMember4],
      },
      {
        name: 'طليعة الصقر',
        leader_id: null,
        member_ids: [ids.scoutMember5, ids.scoutMember6],
      },
    ]);

    const res = await db.query<{ id: string }>(`
      SELECT public.save_team_distribution_draft(
        'توزيع طلائع القسم الكشفي',
        'mixed_stages',
        'seed-006-test',
        $1::jsonb,
        $2::uuid
      ) as id;
    `, [teamsInput, sectionId]);

    assert.ok(res.rows[0].id, 'Draft distribution was created successfully with NULL leader');

    // Verify memberships have is_leader = false (not null)
    const mships = (await db.query<{ is_leader: boolean }>(`
      SELECT is_leader FROM public.team_memberships WHERE distribution_id = $1;
    `, [res.rows[0].id])).rows;

    assert.strictEqual(mships.length, 6);
    assert.strictEqual(mships.every(m => m.is_leader === false), true);
  });

  it('2. Section Leaders can view draft team_memberships under RLS', async () => {
    await asUser(ids.sectionLeader);

    // Get the latest draft
    const distRow = (await db.query<{ id: string }>(`
      SELECT id FROM public.team_distributions ORDER BY created_at DESC LIMIT 1;
    `)).rows[0];

    // Under RLS, section leader selects team_memberships
    const mships = (await db.query<{ id: string; member_id: string }>(`
      SELECT id, member_id FROM public.team_memberships WHERE distribution_id = $1;
    `, [distRow.id])).rows;

    assert.strictEqual(mships.length, 6, 'Section leader must see all 6 members of the draft distribution under RLS');
  });

  it('3. Section Leader can move and swap draft members', async () => {
    await asUser(ids.sectionLeader);

    const distRow = (await db.query<{ id: string }>(`
      SELECT id FROM public.team_distributions ORDER BY created_at DESC LIMIT 1;
    `)).rows[0];

    // Swap scout 1 and scout 3
    await db.query(`
      SELECT public.swap_draft_members($1::uuid, $2::uuid, $3::uuid);
    `, [distRow.id, ids.scoutMember1, ids.scoutMember3]);

    assert.ok(true, 'Swap succeeded for section leader');
  });

  it('4. Section Leader can publish team distribution for their authorized section', async () => {
    await asUser(ids.sectionLeader);

    const distRow = (await db.query<{ id: string }>(`
      SELECT id FROM public.team_distributions ORDER BY created_at DESC LIMIT 1;
    `)).rows[0];

    const pubRes = (await db.query<{ publish_team_distribution: { success: boolean; distribution_id: string } }>(`
      SELECT public.publish_team_distribution($1::uuid);
    `, [distRow.id])).rows[0].publish_team_distribution;

    assert.strictEqual(pubRes.success, true);
    assert.strictEqual(pubRes.distribution_id, distRow.id);

    // Verify it is now published
    const d = (await db.query<{ is_current_published: boolean; status: string }>(`
      SELECT is_current_published, status FROM public.team_distributions WHERE id = $1;
    `, [distRow.id])).rows[0];

    assert.strictEqual(d.is_current_published, true);
    assert.strictEqual(d.status, 'published');
  });

  it('5. Publishing section distribution does not unpublish a different section distribution', async () => {
    await asUser(ids.superAdmin);

    // Create and publish a distribution for otherSectionId
    const teamsInput2 = JSON.stringify([
      {
        name: 'طليعة زهرات',
        leader_id: null,
        member_ids: [ids.scoutMember1, ids.scoutMember2],
      },
    ]);

    const dist2 = (await db.query<{ id: string }>(`
      SELECT public.save_team_distribution_draft('مرشدات', 'mixed_stages', 'seed2', $1::jsonb, $2::uuid) as id;
    `, [teamsInput2, otherSectionId])).rows[0].id;

    await db.query(`SELECT public.publish_team_distribution($1::uuid);`, [dist2]);

    // Check that BOTH distributions are published!
    const publishedList = (await db.query<{ id: string; section_id: string }>(`
      SELECT id, section_id FROM public.team_distributions WHERE is_current_published = true;
    `)).rows;

    assert.strictEqual(publishedList.length, 2, 'Both section distributions remain independently published');
  });

  it('6. Section Leader cannot publish distribution for an unauthorized section', async () => {
    await asUser(ids.sectionLeader);

    // Create draft in otherSectionId as superAdmin
    await asUser(ids.superAdmin);
    const teamsInput3 = JSON.stringify([
      {
        name: 'طليعة تجريبية',
        leader_id: null,
        member_ids: [ids.scoutMember1, ids.scoutMember2],
      },
    ]);
    const unauthorizedDist = (await db.query<{ id: string }>(`
      SELECT public.save_team_distribution_draft('غير مصرح', 'mixed_stages', 'seed3', $1::jsonb, $2::uuid) as id;
    `, [teamsInput3, otherSectionId])).rows[0].id;

    // Try to publish as sectionLeader
    await asUser(ids.sectionLeader);
    await assert.rejects(
      async () => {
        await db.query(`SELECT public.publish_team_distribution($1::uuid);`, [unauthorizedDist]);
      },
      /UNAUTHORIZED_SCOPE/,
      'Section leader cannot publish a distribution outside their section scope'
    );
  });
});
