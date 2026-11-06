import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();

const ids = {
  superAdmin: randomUUID(),
  cubsLeader: randomUUID(),
  guidesLeader: randomUUID(),
  assistantLeader: randomUUID(),
  cubMember1: randomUUID(),
  cubMember2: randomUUID(),
  guideMember: randomUUID(),
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

describe('PostgreSQL (PGlite): migration 003 Dynamic Scout Structure & Role Isolation', () => {
  let cubsSectionId: string;
  let guidesSectionId: string;
  let cubsYear1Id: string;
  let cubsYear2Id: string;
  let guidesYear1Id: string;

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

    // 2. Run migrations 001, 002, and 003 in sequence
    const m1 = readFileSync('supabase/migrations/001_initial_schema.sql', 'utf8');
    const m2 = readFileSync('supabase/migrations/002_production_hardening.sql', 'utf8');
    const m3 = readFileSync('supabase/migrations/003_dynamic_scout_structure_and_role_isolation.sql', 'utf8');

    await db.exec(m1);
    await db.exec(m2);
    await db.exec(m3);

    await db.exec(`
      GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
    `);

    // 3. Provision test auth users
    await asRoot();
    for (const [k, uid] of Object.entries(ids)) {
      await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [uid, `${k}@example.org`]);
    }

    // 4. Retrieve seeded sections and years
    const sections = await rows<{ id: string; code: string }>(`SELECT id, code FROM public.scout_sections`);
    cubsSectionId = sections.find((s) => s.code === 'cubs')!.id;
    guidesSectionId = sections.find((s) => s.code === 'guides')!.id;

    const cubsYears = await rows<{ id: string; display_order: number }>(
      `SELECT id, display_order FROM public.scout_section_years WHERE section_id = $1 ORDER BY display_order`,
      [cubsSectionId]
    );
    cubsYear1Id = cubsYears[0].id;
    cubsYear2Id = cubsYears[1].id;

    const guidesYears = await rows<{ id: string; display_order: number }>(
      `SELECT id, display_order FROM public.scout_section_years WHERE section_id = $1 ORDER BY display_order`,
      [guidesSectionId]
    );
    guidesYear1Id = guidesYears[0].id;

    // 5. Register profiles
    await asService();
    // Super admin
    await db.query(
      `INSERT INTO public.profiles (id, member_number, full_name, section_id, year_id, initial_commitment)
       VALUES ($1, 'SCT-ADMIN', 'القائد العام', $2, $3, 'committed')`,
      [ids.superAdmin, cubsSectionId, cubsYear1Id]
    );
    await db.query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'super_admin')`, [ids.superAdmin]);

    // Cubs leader
    await db.query(
      `INSERT INTO public.profiles (id, member_number, full_name, section_id, year_id, initial_commitment)
       VALUES ($1, 'SCT-LEADER-1', 'قائد الأشبال', $2, $3, 'committed')`,
      [ids.cubsLeader, cubsSectionId, cubsYear1Id]
    );
    await db.query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'section_leader')`, [ids.cubsLeader]);

    // Guides leader
    await db.query(
      `INSERT INTO public.profiles (id, member_number, full_name, section_id, year_id, initial_commitment)
       VALUES ($1, 'SCT-LEADER-2', 'قائد الدليلات', $2, $3, 'committed')`,
      [ids.guidesLeader, guidesSectionId, guidesYear1Id]
    );
    await db.query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'section_leader')`, [ids.guidesLeader]);

    // Member 1 (Cubs Year 1)
    await rpc('register_member_profile_v2', [
      ids.cubMember1,
      'شبل 1',
      '01011111111',
      cubsSectionId,
      cubsYear1Id,
      'committed',
    ]);

    // Member 2 (Cubs Year 2)
    await rpc('register_member_profile_v2', [
      ids.cubMember2,
      'شبل 2',
      '01022222222',
      cubsSectionId,
      cubsYear2Id,
      'committed',
    ]);

    // Guide Member (Guides Year 1)
    await rpc('register_member_profile_v2', [
      ids.guideMember,
      'دليلة 1',
      '01033333333',
      guidesSectionId,
      guidesYear1Id,
      'committed',
    ]);
  });

  it('Super admin assigns scopes to Section Leaders', async () => {
    await asUser(ids.superAdmin);
    // Assign cubsLeader to entire cubs section (year_id = NULL)
    const assignCubs = await rpc('assign_staff_scope', [ids.cubsLeader, cubsSectionId, null]);
    assert.ok(assignCubs);

    // Assign guidesLeader to entire guides section
    const assignGuides = await rpc('assign_staff_scope', [ids.guidesLeader, guidesSectionId, null]);
    assert.ok(assignGuides);

    const scopes = await rows(`SELECT * FROM public.staff_scope_assignments WHERE user_id = $1`, [ids.cubsLeader]);
    assert.strictEqual(scopes.length, 1);
    assert.strictEqual(scopes[0].section_id, cubsSectionId);
    assert.strictEqual(scopes[0].year_id, null);
  });

  it('Strict Scope Isolation: Cubs leader sees cubs members only; cannot see Guides', async () => {
    await asUser(ids.cubsLeader);
    const visibleProfiles = await rows<{ id: string; full_name: string }>(`SELECT id, full_name FROM public.profiles`);
    const visibleIds = visibleProfiles.map((p) => p.id);

    // Should see own profile and cubs members
    assert.ok(visibleIds.includes(ids.cubsLeader));
    assert.ok(visibleIds.includes(ids.cubMember1));
    assert.ok(visibleIds.includes(ids.cubMember2));

    // MUST NOT see Guides member or Guides leader!
    assert.strictEqual(visibleIds.includes(ids.guideMember), false);
    assert.strictEqual(visibleIds.includes(ids.guidesLeader), false);
  });

  it('Strict Scope Isolation: Ordinary member sees ONLY their own profile', async () => {
    await asUser(ids.cubMember1);
    const visibleProfiles = await rows<{ id: string; full_name: string }>(`SELECT id, full_name FROM public.profiles`);
    assert.strictEqual(visibleProfiles.length, 1);
    assert.strictEqual(visibleProfiles[0].id, ids.cubMember1);
  });

  it('Non-super admin cannot call assign_staff_scope', async () => {
    await asUser(ids.cubsLeader);
    await assert.rejects(
      async () => {
        await rpc('assign_staff_scope', [ids.cubsLeader, guidesSectionId, null]);
      },
      /FORBIDDEN/
    );
  });

  it('QR Verification Scope Enforcement: Cubs leader scanning Guides member is rejected with unauthorized_scope', async () => {
    // Get Guide member's active QR token as root (bypassing RLS for test fixture lookup)
    await asRoot();
    const guideTokens = await rows<{ id: string }>(
      `SELECT id FROM public.qr_credentials WHERE member_id = $1 AND is_active`,
      [ids.guideMember]
    );
    const guideQr = guideTokens[0].id;

    // Cubs leader attempts to verify Guides member's QR
    await asUser(ids.cubsLeader);
    const result = await rpc<{ status: string }>('verify_qr_credential', [guideQr]);
    assert.strictEqual(result.status, 'unauthorized_scope');
    assert.strictEqual((result as any).member, undefined); // Does not leak private member data!
  });

  it('QR Verification Scope Enforcement: Cubs leader scanning Cubs member succeeds', async () => {
    await asRoot();
    const cubTokens = await rows<{ id: string }>(
      `SELECT id FROM public.qr_credentials WHERE member_id = $1 AND is_active`,
      [ids.cubMember1]
    );
    const cubQr = cubTokens[0].id;

    await asUser(ids.cubsLeader);
    const result = await rpc<{ status: string; member: { id: string } }>('verify_qr_credential', [cubQr]);
    assert.strictEqual(result.status, 'valid');
    assert.strictEqual(result.member.id, ids.cubMember1);
  });

  it('Attendance Recording Scope Enforcement: cross-scope scanning rejected', async () => {
    // Create an active Friday session
    const friday = '2026-11-13'; // Friday
    await asRoot();
    const sessionRes = await rows<{ id: string }>(
      `INSERT INTO public.friday_sessions (session_date, title, start_time, late_threshold_time, is_open_for_attendance)
       VALUES ($1, 'اجتماع تجريبي', '07:30:00', '08:00:00', true)
       ON CONFLICT (session_date) DO UPDATE SET is_open_for_attendance = true
       RETURNING id`,
      [friday]
    );
    const sessionId = sessionRes[0].id;

    // Guide QR
    const guideTokens = await rows<{ id: string }>(
      `SELECT id FROM public.qr_credentials WHERE member_id = $1 AND is_active`,
      [ids.guideMember]
    );
    const guideQr = guideTokens[0].id;

    // Cubs leader tries to record attendance for Guide member
    await asUser(ids.cubsLeader);
    const res = await rpc<{ success: boolean; code: string }>('record_attendance', [
      sessionId,
      'with_uniform',
      guideQr,
      null,
      null,
    ]);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'UNAUTHORIZED_SCOPE');

    // Cubs leader records attendance for Cubs member -> succeeds!
    await asRoot();
    const cubTokens = await rows<{ id: string }>(
      `SELECT id FROM public.qr_credentials WHERE member_id = $1 AND is_active`,
      [ids.cubMember1]
    );
    const cubQr = cubTokens[0].id;

    await asUser(ids.cubsLeader);
    const okRes = await rpc<{ success: boolean; arrival_status: string }>('record_attendance', [
      sessionId,
      'with_uniform',
      cubQr,
      null,
      null,
    ]);
    assert.strictEqual(okRes.success, true);
  });
});
