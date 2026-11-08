import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();

const ids = {
  superAdmin: randomUUID(),
  adminUser: randomUUID(),
  cubsLeader: randomUUID(),
  cubsMember: randomUUID(),
  otherMember: randomUUID(),
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

describe('PostgreSQL (PGlite): migration 004 Friday Meetings & Member Lifecycle', () => {
  let sectionCubsId: string;
  let sectionGuidesId: string;

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

    // 2. Apply migrations 001, 002, 003
    const m1 = readFileSync('supabase/migrations/001_initial_schema.sql', 'utf8');
    const m2 = readFileSync('supabase/migrations/002_production_hardening.sql', 'utf8');
    const m3 = readFileSync('supabase/migrations/003_dynamic_scout_structure_and_role_isolation.sql', 'utf8');
    await db.exec(m1);
    await db.exec(m2);
    await db.exec(m3);

    // 3. Apply migration 004
    const m4 = readFileSync('supabase/migrations/004_friday_meetings_and_member_lifecycle.sql', 'utf8');
    await db.exec(m4);

    await db.exec(`
      GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
    `);

    // Retrieve seeded sections from 003
    const sections = await rows<{ id: string; code: string }>(`SELECT id, code FROM public.scout_sections`);
    sectionCubsId = sections.find((s) => s.code === 'cubs')!.id;
    sectionGuidesId = sections.find((s) => s.code === 'guides')!.id;

    // Insert profiles
    for (const [name, id] of [
      ['Super Admin', ids.superAdmin],
      ['General Admin', ids.adminUser],
      ['Cubs Leader', ids.cubsLeader],
      ['Scout Cub', ids.cubsMember],
      ['Other Member', ids.otherMember],
    ]) {
      await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, `${id}@alfanar.test`]);
      await db.query(
        `INSERT INTO public.profiles (id, member_number, full_name, stage_id, is_active, section_id, initial_commitment)
         VALUES ($1, $2, $3, 'stage_1', true, $4, 'committed')`,
        [id, `TEST-${id.slice(0, 4)}`, name, sectionCubsId]
      );
    }

    // Assign roles
    await db.query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'super_admin')`, [ids.superAdmin]);
    await db.query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'admin')`, [ids.adminUser]);
    await db.query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'attendance_leader')`, [ids.cubsLeader]);
  });

  it('1. Supports creating multiple section-scoped Friday sessions on the same Friday', async () => {
    await asUser(ids.superAdmin);

    const testFriday = '2026-11-20'; // Friday

    // Session for Cubs
    const sess1 = await rows<{ id: string; status: string; is_open_for_attendance: boolean }>(
      `INSERT INTO public.friday_sessions (session_date, title, section_id, is_open_for_attendance)
       VALUES ($1, 'اجتماع الأشبال الأسبوعي', $2, false) RETURNING id, status, is_open_for_attendance`,
      [testFriday, sectionCubsId]
    );
    assert.strictEqual(sess1.length, 1);
    assert.strictEqual(sess1[0].status, 'scheduled');
    assert.strictEqual(sess1[0].is_open_for_attendance, false);

    // Session for Guides on SAME date (must succeed without unique constraint error!)
    const sess2 = await rows<{ id: string; status: string; is_open_for_attendance: boolean }>(
      `INSERT INTO public.friday_sessions (session_date, title, section_id, is_open_for_attendance)
       VALUES ($1, 'اجتماع المرشدات الأسبوعي', $2, true) RETURNING id, status, is_open_for_attendance`,
      [testFriday, sectionGuidesId]
    );
    assert.strictEqual(sess2.length, 1);
    // Auto-synced to 'open' status!
    assert.strictEqual(sess2[0].status, 'open');
    assert.strictEqual(sess2[0].is_open_for_attendance, true);
  });

  it('2. Status and is_open_for_attendance are automatically synchronized via trigger', async () => {
    await asUser(ids.superAdmin);
    const date = '2026-11-27';

    const [sess] = await rows<{ id: string; status: string; is_open_for_attendance: boolean }>(
      `INSERT INTO public.friday_sessions (session_date, title, is_open_for_attendance)
       VALUES ($1, 'اجتماع عام', false) RETURNING id, status, is_open_for_attendance`,
      [date]
    );
    assert.strictEqual(sess.status, 'scheduled');
    assert.strictEqual(sess.is_open_for_attendance, false);

    // Opening attendance updates status to 'open'
    await db.query(`UPDATE public.friday_sessions SET is_open_for_attendance = true WHERE id = $1`, [sess.id]);
    const [updated1] = await rows<{ status: string; is_open_for_attendance: boolean }>(
      `SELECT status, is_open_for_attendance FROM public.friday_sessions WHERE id = $1`,
      [sess.id]
    );
    assert.strictEqual(updated1.status, 'open');
    assert.strictEqual(updated1.is_open_for_attendance, true);

    // Setting status to 'closed' sets is_open_for_attendance to false
    await db.query(`UPDATE public.friday_sessions SET status = 'closed' WHERE id = $1`, [sess.id]);
    const [updated2] = await rows<{ status: string; is_open_for_attendance: boolean }>(
      `SELECT status, is_open_for_attendance FROM public.friday_sessions WHERE id = $1`,
      [sess.id]
    );
    assert.strictEqual(updated2.status, 'closed');
    assert.strictEqual(updated2.is_open_for_attendance, false);
  });

  it('3. Attendance record deletion by staff with audit logging', async () => {
    await asUser(ids.superAdmin);
    const [sess] = await rows<{ id: string }>(
      `INSERT INTO public.friday_sessions (session_date, title, is_open_for_attendance)
       VALUES ('2026-12-04', 'اجتماع تجريبي للحذف', true) RETURNING id`
    );

    // Record attendance
    const [rec] = await rows<{ id: string }>(
      `INSERT INTO public.attendance_records (session_id, member_id, uniform_status, arrival_status, recorded_by)
       VALUES ($1, $2, 'with_uniform', 'on_time', $3) RETURNING id`,
      [sess.id, ids.cubsMember, ids.superAdmin]
    );

    // Cubs leader deletes attendance record
    await asUser(ids.cubsLeader);
    const res = await rpc<{ success: boolean; record_id: string }>(
      'delete_attendance_record',
      [rec.id, 'تسجيل بالخطأ']
    );
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.record_id, rec.id);

    // Verify record is gone
    const check = await rows(`SELECT id FROM public.attendance_records WHERE id = $1`, [rec.id]);
    assert.strictEqual(check.length, 0);

    // Verify audit log
    await asUser(ids.superAdmin);
    const logs = await rows(
      `SELECT * FROM public.audit_logs WHERE action = 'ATTENDANCE_RECORD_DELETED' AND entity_id = $1`,
      [rec.id]
    );
    assert.strictEqual(logs.length, 1);
  });

  it('4. Member deactivation and reactivation protects against self-deactivation', async () => {
    await asUser(ids.superAdmin);

    // Deactivate a member
    const resDeact = await rpc<{ success: boolean; is_active: boolean }>(
      'toggle_member_active',
      [ids.otherMember, false]
    );
    assert.strictEqual(resDeact.success, true);
    assert.strictEqual(resDeact.is_active, false);

    // Verify profile is inactive
    const [p1] = await rows<{ is_active: boolean }>(`SELECT is_active FROM public.profiles WHERE id = $1`, [ids.otherMember]);
    assert.strictEqual(p1.is_active, false);

    // Reactivate member
    const resReact = await rpc<{ success: boolean; is_active: boolean }>(
      'toggle_member_active',
      [ids.otherMember, true]
    );
    assert.strictEqual(resReact.success, true);
    assert.strictEqual(resReact.is_active, true);

    // Attempting to deactivate oneself is rejected
    const selfDeact = await rpc<{ success: boolean; code: string }>(
      'toggle_member_active',
      [ids.superAdmin, false]
    );
    assert.strictEqual(selfDeact.success, false);
    assert.strictEqual(selfDeact.code, 'CANNOT_DEACTIVATE_SELF');
  });

  it('5. Safe permanent deletion cascades child records and preserves integrity', async () => {
    // Non-super-admin is forbidden
    await asUser(ids.cubsLeader);
    await assert.rejects(
      async () => {
        await rpc('delete_member_permanent', [ids.otherMember]);
      },
      /FORBIDDEN/
    );

    // Super Admin executes permanent deletion
    await asUser(ids.superAdmin);

    // Cannot delete oneself
    const selfDel = await rpc<{ success: boolean; code: string }>(
      'delete_member_permanent',
      [ids.superAdmin]
    );
    assert.strictEqual(selfDel.success, false);
    assert.strictEqual(selfDel.code, 'CANNOT_DELETE_SELF');

    // Successfully deletes otherMember
    const delRes = await rpc<{ success: boolean; deleted_member_id: string }>(
      'delete_member_permanent',
      [ids.otherMember]
    );
    assert.strictEqual(delRes.success, true);
    assert.strictEqual(delRes.deleted_member_id, ids.otherMember);

    // Verify member profile is removed
    const remaining = await rows(`SELECT id FROM public.profiles WHERE id = $1`, [ids.otherMember]);
    assert.strictEqual(remaining.length, 0);

    // Verify deletion was audited
    const delLogs = await rows(
      `SELECT * FROM public.audit_logs WHERE action = 'MEMBER_PERMANENTLY_DELETED' AND entity_id = $1`,
      [ids.otherMember]
    );
    assert.strictEqual(delLogs.length, 1);
  });
});
