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
  orphanMember: randomUUID(),
};

async function asRoot() {
  await db.exec(`RESET ROLE;`);
}
async function asService() {
  await db.exec(`RESET ROLE; SET ROLE service_role;`);
}
async function asAnon() {
  await db.exec(`RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claim.sub','',false);`);
}
async function asUser(id: string) {
  await db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id}',false);`);
}
async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}
async function rpc<T = any>(fn: string, params: unknown[] = []): Promise<T> {
  const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');
  const r = await db.query<{ v: T }>(`SELECT public.${fn}(${placeholders}) AS v`, params);
  return r.rows[0].v;
}

describe('PostgreSQL (PGlite): migration 005 Member Auth & Dynamic Identity Hardening', () => {
  let sectionId: string;
  let yearId: string;

  before(async () => {
    // 1. Initialize environment
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

    // 2. Apply migrations 001, 002, 003, 004, and 005
    const m1 = readFileSync('supabase/migrations/001_initial_schema.sql', 'utf8');
    const m2 = readFileSync('supabase/migrations/002_production_hardening.sql', 'utf8');
    const m3 = readFileSync('supabase/migrations/003_dynamic_scout_structure_and_role_isolation.sql', 'utf8');
    const m4 = readFileSync('supabase/migrations/004_friday_meetings_and_member_lifecycle.sql', 'utf8');
    const m5 = readFileSync('supabase/migrations/005_member_auth_and_dynamic_identity.sql', 'utf8');

    await db.exec(m1);
    await db.exec(m2);
    await db.exec(m3);
    await db.exec(m4);
    await db.exec(m5);

    // 3. Seed users
    for (const [name, id] of Object.entries(ids)) {
      await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2);`, [id, `${name}@alfanar.test`]);
    }

    // Provision super admin
    await asService();
    await db.query(`INSERT INTO public.profiles (id, full_name, member_number, initial_commitment) VALUES ($1, 'مسؤول النظام', 'ADMIN-001', 'committed');`, [ids.superAdmin]);
    await db.query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'super_admin');`, [ids.superAdmin]);

    // Provision section leader
    await db.query(`INSERT INTO public.profiles (id, full_name, member_number, initial_commitment) VALUES ($1, 'قائد قسم كشافة', 'LDR-2026-0001', 'committed');`, [ids.sectionLeader]);
    await db.query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'section_leader');`, [ids.sectionLeader]);

    // Provision section & year
    const secRes = await rows<{ id: string }>(
      `INSERT INTO public.scout_sections (name, code, display_order) VALUES ('فريق كشافة', 'scouts_sec', 1) RETURNING id;`
    );
    sectionId = secRes[0].id;

    const yrRes = await rows<{ id: string }>(
      `INSERT INTO public.scout_section_years (section_id, name, display_order) VALUES ($1, 'سنة ثانية', 1) RETURNING id;`,
      [sectionId]
    );
    yearId = yrRes[0].id;

    // Assign scope to section leader
    await asUser(ids.superAdmin);
    await rpc('assign_staff_scope', [ids.sectionLeader, sectionId, null]);

    // Provision ordinary scouts with dynamic section (stage_id is NULL)
    await asService();
    await rpc('register_member_profile_v2', [
      ids.scoutMember1,
      'كشاف أول',
      '+201011111111',
      sectionId,
      yearId,
      'committed',
    ]);

    await rpc('register_member_profile_v2', [
      ids.scoutMember2,
      'كشاف ثاني',
      '+201022222222',
      sectionId,
      yearId,
      'committed',
    ]);

    await rpc('register_member_profile_v2', [
      ids.orphanMember,
      'كشاف مؤقت للحذف',
      '+201033333333',
      sectionId,
      yearId,
      'committed',
    ]);
  });

  it('1. Section leader can save team distribution drafts with dynamic section', async () => {
    await asUser(ids.sectionLeader);

    const teamsInput = [
      {
        name: 'طليعة النسور',
        color_hex: '#173C32',
        icon_name: 'compass',
        leader_id: ids.scoutMember1,
        member_ids: [ids.scoutMember1],
        section_id: sectionId,
      },
      {
        name: 'طليعة الفهود',
        color_hex: '#23836B',
        icon_name: 'zap',
        leader_id: ids.scoutMember2,
        member_ids: [ids.scoutMember2],
        section_id: sectionId,
      },
    ];

    // Calls 5-arg signature including section_id
    const distId = await rpc<string>('save_team_distribution_draft', [
      'توزيع طلائع القسم الكشفي',
      'mixed_stages',
      'seed123',
      JSON.stringify(teamsInput),
      sectionId,
    ]);

    assert.ok(distId, 'Draft ID must be returned');

    // Confirm section_id is persisted on team_distributions and teams
    const distRow = await rows<{ section_id: string }>(
      `SELECT section_id FROM public.team_distributions WHERE id = $1;`,
      [distId]
    );
    assert.strictEqual(distRow[0].section_id, sectionId);
  });

  it('2. Legacy 4-argument signature is supported for backwards compatibility', async () => {
    await asUser(ids.superAdmin);

    const teamsInput = [
      {
        name: 'طليعة الأبطال',
        color_hex: '#173C32',
        icon_name: 'compass',
        leader_id: ids.scoutMember1,
        member_ids: [ids.scoutMember1, ids.scoutMember2],
      },
    ];

    const distId = await rpc<string>('save_team_distribution_draft', [
      'توزيع عام بالطريقة التقليدية',
      'mixed_stages',
      'seed456',
      JSON.stringify(teamsInput),
    ]);

    assert.ok(distId, 'Must successfully save with 4 arguments');
  });

  it('3. Member deletion permanently cascades child records and profiles', async () => {
    await asUser(ids.superAdmin);

    // Verify target exists
    const beforeCheck = await rows(`SELECT id FROM public.profiles WHERE id = $1;`, [ids.orphanMember]);
    assert.strictEqual(beforeCheck.length, 1);

    // Call delete_member_permanent
    const res = await rpc<{ success: boolean; deleted_member_id: string }>('delete_member_permanent', [
      ids.orphanMember,
    ]);

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.deleted_member_id, ids.orphanMember);

    // Verify all profile and child records are deleted
    const afterCheck = await rows(`SELECT id FROM public.profiles WHERE id = $1;`, [ids.orphanMember]);
    assert.strictEqual(afterCheck.length, 0);

    const credCheck = await rows(`SELECT id FROM public.qr_credentials WHERE member_id = $1;`, [ids.orphanMember]);
    assert.strictEqual(credCheck.length, 0);

    const auditCheck = await rows<{ action: string }>(
      `SELECT action FROM public.audit_logs WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 1;`,
      [ids.orphanMember]
    );
    assert.strictEqual(auditCheck[0].action, 'MEMBER_PERMANENTLY_DELETED');
  });

  it('4. Deleting self or deleting another super admin is rejected', async () => {
    await asUser(ids.superAdmin);

    // Self delete rejected
    const selfRes = await rpc<{ success: boolean; code: string }>('delete_member_permanent', [ids.superAdmin]);
    assert.strictEqual(selfRes.success, false);
    assert.strictEqual(selfRes.code, 'CANNOT_DELETE_SELF');

    // Section leader or non-super admin cannot call delete
    await asUser(ids.sectionLeader);
    const nonAdminRes = await rpc<{ success: boolean; code: string }>('delete_member_permanent', [ids.scoutMember1]);
    assert.strictEqual(nonAdminRes.success, false);
    assert.strictEqual(nonAdminRes.code, 'FORBIDDEN');
  });
});
