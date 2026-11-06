/**
 * SQL migration verification against a REAL PostgreSQL engine (PGlite = Postgres compiled to WASM).
 *
 * What this proves:  migrations 001+002 apply cleanly; constraints, RLS policies and the
 *                    SECURITY DEFINER functions behave as designed (auth.uid() is emulated).
 * What this does NOT prove: anything about a hosted Supabase project, Supabase Auth, PostgREST,
 *                    real network concurrency (PGlite is a single connection), or email flows.
 *                    See tests/integration/supabase.live.test.ts for the live-project workflow.
 */
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();

const ids = {
  superAdmin: randomUUID(),
  admin: randomUUID(),
  leader: randomUUID(),
  m1: randomUUID(), // stage_1
  m2: randomUUID(), // stage_1
  m3: randomUUID(), // stage_2
  m4: randomUUID(), // stage_2
  m5: randomUUID(), // stage_3
  m6: randomUUID(), // stage_3
};

async function asRoot() { await db.exec(`RESET ROLE;`); }
async function asService() { await db.exec(`RESET ROLE; SET ROLE service_role;`); }
async function asAnon() { await db.exec(`RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claim.sub','',false);`); }
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

function fridayOffset(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 86400000);
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function teamsPayload(mode: 'mixed' | 'separate', memberIds: string[][], stages?: string[]) {
  return memberIds.map((members, i) => ({
    name: `فريق ${i + 1}`,
    stage_id: mode === 'separate' ? stages![i] : null,
    color_hex: '#23836B',
    icon_name: 'compass',
    leader_id: members[0] ?? null,
    member_ids: members,
  }));
}

describe('PostgreSQL (PGlite): migrations 001 + 002', () => {
  before(async () => {
    await db.exec(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
        AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
      -- Supabase grants table privileges to API roles by default; RLS is what gates them.
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    `);
    await db.exec(readFileSync('supabase/migrations/001_initial_schema.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/002_production_hardening.sql', 'utf8'));
  });

  describe('registration & role isolation', () => {
    it('registers members atomically (profile + member role + active QR) and numbers them', async () => {
      const people: [string, string, string, string][] = [
        [ids.superAdmin, 'قائد عام للفوج', 'stage_3', 'committed'],
        [ids.admin, 'قائد إداري للفوج', 'stage_3', 'committed'],
        [ids.leader, 'مسؤول الحضور في الفوج', 'stage_3', 'committed'],
        [ids.m1, 'أحمد محمود السيد', 'stage_1', 'committed'],
        [ids.m2, 'يوسف علي حسن', 'stage_1', 'circumstances'],
        [ids.m3, 'عمر خالد إبراهيم', 'stage_2', 'committed'],
        [ids.m4, 'زياد طارق منصور', 'stage_2', 'inactive'],
        [ids.m5, 'مروان سيف الدين', 'stage_3', 'committed'],
        [ids.m6, 'كريم ياسين عثمان', 'stage_3', 'committed'],
      ];
      await asRoot();
      for (const [id] of people) await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, `${id}@test.local`]);
      await asService();
      const numbers: string[] = [];
      for (const [id, name, stage, commit] of people) {
        numbers.push(await rpc<string>('register_member_profile', [id, name, '01012345678', stage, commit]));
      }
      assert.match(numbers[0], /^SCT-\d{4}-0001$/);
      assert.strictEqual(new Set(numbers).size, people.length, 'member numbers must be unique');

      await asRoot();
      const roles = await rows<{ role: string }>(`SELECT DISTINCT role FROM public.user_roles`);
      assert.deepStrictEqual(roles.map((r) => r.role), ['member'], 'public registration may only create the member role');
      const qr = await rows<{ c: string }>(`SELECT count(*)::int AS c FROM public.qr_credentials WHERE is_active`);
      assert.strictEqual(Number(qr[0].c), people.length);

      // Bootstrap privileged roles the sanctioned way (SQL editor / service role only).
      await db.query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1,'super_admin'), ($2,'admin'), ($3,'attendance_leader')`,
        [ids.superAdmin, ids.admin, ids.leader]);
    });

    it('rejects invalid registration input and unknown auth users (nothing is partially written)', async () => {
      await asService();
      const ghost = randomUUID();
      await assert.rejects(() => rpc('register_member_profile', [ghost, 'اسم صحيح هنا', null, 'stage_1', 'committed']), /AUTH_USER_NOT_FOUND/);
      await asRoot();
      await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'x@test.local')`, [ghost]);
      await asService();
      await assert.rejects(() => rpc('register_member_profile', [ghost, 'ab', null, 'stage_1', 'committed']), /INVALID_NAME/);
      await assert.rejects(() => rpc('register_member_profile', [ghost, 'اسم صحيح هنا', 'abc', 'stage_1', 'committed']), /INVALID_PHONE/);
      await assert.rejects(() => rpc('register_member_profile', [ghost, 'اسم صحيح هنا', null, 'stage_9', 'committed']));
      await asRoot();
      const leftovers = await rows(`SELECT 1 FROM public.profiles WHERE id = $1`, [ghost]);
      assert.strictEqual(leftovers.length, 0, 'failed registration must leave no profile row');
      const roleRows = await rows(`SELECT 1 FROM public.user_roles WHERE user_id = $1`, [ghost]);
      assert.strictEqual(roleRows.length, 0);
    });

    it('authenticated/anon users cannot call register_member_profile', async () => {
      await asUser(ids.m1);
      await assert.rejects(() => rpc('register_member_profile', [ids.m1, 'محاولة تسجيل', null, 'stage_1', 'committed']), /permission denied/i);
      await asAnon();
      await assert.rejects(() => rpc('register_member_profile', [ids.m1, 'محاولة تسجيل', null, 'stage_1', 'committed']), /permission denied/i);
    });

    it('a member cannot grant themselves any role; a plain admin cannot assign roles; super admin can', async () => {
      await asUser(ids.m1);
      await assert.rejects(() => db.query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'super_admin')`, [ids.m1]), /row-level security/i);
      await asUser(ids.leader);
      await assert.rejects(() => db.query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'admin')`, [ids.leader]), /row-level security/i);
      await asUser(ids.admin);
      await assert.rejects(() => db.query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'admin')`, [ids.m2]), /row-level security/i);
      await asUser(ids.superAdmin);
      await db.query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'attendance_leader')`, [ids.m2]);
      await db.query(`DELETE FROM public.user_roles WHERE user_id = $1 AND role = 'attendance_leader'`, [ids.m2]);
    });

    it('members cannot insert profiles or change privileged profile columns', async () => {
      await asUser(ids.m1);
      await assert.rejects(() => db.query(`INSERT INTO public.profiles (id, member_number, full_name, initial_commitment) VALUES ($1,'SCT-X','فلان الفلاني','committed')`, [randomUUID()]));
      await assert.rejects(() => db.query(`UPDATE public.profiles SET is_active = false WHERE id = $1`, [ids.m1]), /FORBIDDEN_FIELD_UPDATE/);
      await assert.rejects(() => db.query(`UPDATE public.profiles SET stage_id = 'stage_3' WHERE id = $1`, [ids.m1]), /FORBIDDEN_FIELD_UPDATE/);
      await db.query(`UPDATE public.profiles SET avatar_url = 'x' WHERE id = $1`, [ids.m1]); // allowed field
    });

    it('a member sees only their own profile; anonymous sees nothing', async () => {
      await asUser(ids.m1);
      const mine = await rows(`SELECT id FROM public.profiles`);
      assert.strictEqual(mine.length, 1);
      assert.strictEqual((mine[0] as { id: string }).id, ids.m1);
      await asAnon();
      assert.strictEqual((await rows(`SELECT id FROM public.profiles`)).length, 0);
      assert.strictEqual((await rows(`SELECT id FROM public.qr_credentials`)).length, 0);
    });
  });

  describe('team distributions: drafts, publishing, history', () => {
    let draftMixed = '';
    let draftSeparate = '';

    it('saves a mixed-stage draft atomically and rejects invalid drafts', async () => {
      await asUser(ids.admin);
      draftMixed = await rpc<string>('save_team_distribution_draft', [
        'توزيع مختلط', 'mixed_stages', 'seed-1',
        JSON.stringify(teamsPayload('mixed', [[ids.m1, ids.m3, ids.m5], [ids.m2, ids.m4, ids.m6]])),
      ]);
      assert.ok(draftMixed);

      await assert.rejects(() => rpc('save_team_distribution_draft', ['مكرر', 'mixed_stages', 's',
        JSON.stringify(teamsPayload('mixed', [[ids.m1, ids.m2], [ids.m2, ids.m3]]))]), /DUPLICATE_MEMBER/);
      await assert.rejects(() => rpc('save_team_distribution_draft', ['مجهول', 'mixed_stages', 's',
        JSON.stringify(teamsPayload('mixed', [[randomUUID()]]))]), /INVALID_MEMBER/);
      await assert.rejects(() => rpc('save_team_distribution_draft', ['بدون فرق', 'mixed_stages', 's', '[]']), /NO_TEAMS/);
      await assert.rejects(() => rpc('save_team_distribution_draft', ['نمط خاطئ', 'weird', 's',
        JSON.stringify(teamsPayload('mixed', [[ids.m1]]))]), /INVALID_MODE/);

      await asRoot();
      const failedDrafts = await rows(`SELECT 1 FROM public.team_distributions WHERE title IN ('مكرر','مجهول','بدون فرق','نمط خاطئ')`);
      assert.strictEqual(failedDrafts.length, 0, 'failed saves must not leave partial rows');
    });

    it('stage-separated draft enforces stage isolation (save, move and swap)', async () => {
      await asUser(ids.admin);
      await assert.rejects(() => rpc('save_team_distribution_draft', ['خلط مراحل', 'separate_stages', 's',
        JSON.stringify(teamsPayload('separate', [[ids.m1, ids.m3]], ['stage_1']))]), /STAGE_MISMATCH/);

      draftSeparate = await rpc<string>('save_team_distribution_draft', [
        'توزيع منفصل', 'separate_stages', 'seed-2',
        JSON.stringify(teamsPayload('separate', [[ids.m1], [ids.m2], [ids.m3, ids.m4], [ids.m5, ids.m6]],
          ['stage_1', 'stage_1', 'stage_2', 'stage_3'])),
      ]);
      const teams = await rows<{ id: string; stage_id: string }>(
        `SELECT id, stage_id FROM public.teams WHERE distribution_id = $1 ORDER BY name`, [draftSeparate]);
      const stage2Team = teams.find((t) => t.stage_id === 'stage_2')!;
      const stage1TeamB = teams[1];
      await assert.rejects(() => rpc('move_draft_member', [draftSeparate, ids.m1, stage2Team.id]), /STAGE_MISMATCH/);
      await assert.rejects(() => rpc('swap_draft_members', [draftSeparate, ids.m1, ids.m3]), /STAGE_MISMATCH/);
      await rpc('swap_draft_members', [draftSeparate, ids.m1, ids.m2]); // same stage: allowed
      await rpc('move_draft_member', [draftSeparate, ids.m2, stage1TeamB.id]);
      const dup = await rows(`SELECT member_id FROM public.team_memberships WHERE distribution_id = $1 GROUP BY member_id HAVING count(*) > 1`, [draftSeparate]);
      assert.strictEqual(dup.length, 0);
    });

    it('DB-level constraint: a member cannot be in two teams of one distribution', async () => {
      await asRoot();
      const t = await rows<{ id: string }>(`SELECT id FROM public.teams WHERE distribution_id = $1 LIMIT 2`, [draftMixed]);
      const existing = await rows<{ member_id: string; team_id: string }>(
        `SELECT member_id, team_id FROM public.team_memberships WHERE distribution_id = $1 AND team_id = $2 LIMIT 1`, [draftMixed, t[0].id]);
      const other = t.find((x) => x.id !== existing[0].team_id)!;
      await assert.rejects(() => db.query(
        `INSERT INTO public.team_memberships (team_id, distribution_id, member_id) VALUES ($1, $2, $3)`,
        [other.id, draftMixed, existing[0].member_id]), /uq_membership_per_distribution|duplicate key/);
      // Composite FK: membership cannot point to a team of a different distribution.
      await db.query(`DELETE FROM public.team_memberships WHERE distribution_id = $1 AND member_id = $2`, [draftSeparate, ids.m6]);
      await assert.rejects(() => db.query(
        `INSERT INTO public.team_memberships (team_id, distribution_id, member_id) VALUES ($1, $2, $3)`,
        [t[0].id, draftSeparate, ids.m6]), /fk_membership_team_distribution|foreign key/);
    });

    it('drafts are invisible to ordinary members and anonymous users, visible to admins', async () => {
      await asUser(ids.m1);
      assert.strictEqual((await rows(`SELECT id FROM public.team_distributions`)).length, 0);
      assert.strictEqual(await rpc('get_my_published_team'), null);
      await asAnon();
      assert.strictEqual((await rows(`SELECT id FROM public.team_distributions`)).length, 0);
      await asUser(ids.admin);
      assert.ok((await rows(`SELECT id FROM public.team_distributions`)).length >= 2);
    });

    it('members and leaders cannot publish or save drafts', async () => {
      await asUser(ids.m1);
      await assert.rejects(() => rpc('publish_team_distribution', [draftMixed]), /FORBIDDEN/);
      await assert.rejects(() => rpc('save_team_distribution_draft', ['x', 'mixed_stages', 's', JSON.stringify(teamsPayload('mixed', [[ids.m1]]))]), /FORBIDDEN/);
      await asUser(ids.leader);
      await assert.rejects(() => rpc('publish_team_distribution', [draftMixed]), /FORBIDDEN/);
      await asAnon();
      await assert.rejects(() => rpc('publish_team_distribution', [draftMixed]), /permission denied/i);
    });

    it('publish is atomic: failed publish changes nothing; successful publish exposes roster without private data', async () => {
      await asUser(ids.admin);
      await assert.rejects(() => rpc('publish_team_distribution', [randomUUID()]), /DISTRIBUTION_NOT_FOUND/);
      await asRoot();
      assert.strictEqual((await rows(`SELECT 1 FROM public.team_distributions WHERE is_current_published`)).length, 0);

      await asUser(ids.admin);
      await rpc('publish_team_distribution', [draftMixed]);

      await asUser(ids.m3);
      const mine: any = await rpc('get_my_published_team');
      assert.ok(mine, 'member in published team must see it');
      assert.strictEqual(mine.members.length, 3);
      for (const m of mine.members) {
        assert.deepStrictEqual(Object.keys(m).sort(), ['full_name', 'id', 'is_leader', 'stage_id'], 'roster must expose no phone/commitment');
      }
      // Member not in the still-unpublished separate draft sees nothing of it.
      assert.strictEqual((await rows(`SELECT id FROM public.team_distributions WHERE id = $1`, [draftSeparate])).length, 0);
      // Other teams' membership rows are not directly readable.
      const direct = await rows(`SELECT member_id FROM public.team_memberships`);
      assert.deepStrictEqual(direct.map((r: any) => r.member_id), [ids.m3]);
    });

    it('publishing a second version archives (never deletes) the first; only one stays current', async () => {
      await asUser(ids.admin);
      await rpc('publish_team_distribution', [draftSeparate]);
      await asRoot();
      const cur = await rows<{ id: string }>(`SELECT id FROM public.team_distributions WHERE is_current_published`);
      assert.deepStrictEqual(cur.map((r) => r.id), [draftSeparate]);
      const old = await rows<{ status: string }>(`SELECT status FROM public.team_distributions WHERE id = $1`, [draftMixed]);
      assert.strictEqual(old[0].status, 'archived');
      const history = await rows<{ c: number }>(`SELECT count(*)::int AS c FROM public.team_memberships WHERE distribution_id = $1`, [draftMixed]);
      assert.strictEqual(Number(history[0].c), 6, 'archived version keeps its full roster');
      // Published distributions are immutable via draft editing functions.
      await asUser(ids.admin);
      await assert.rejects(() => rpc('swap_draft_members', [draftSeparate, ids.m5, ids.m6]), /NOT_DRAFT/);
    });

    it('database itself refuses two simultaneous "current" distributions', async () => {
      await asRoot();
      await assert.rejects(() => db.query(`UPDATE public.team_distributions SET is_current_published = true, status = 'published' WHERE id = $1`, [draftMixed]), /uq_one_current_published|duplicate key/);
      await assert.rejects(() => db.query(`UPDATE public.team_distributions SET is_current_published = true WHERE id = $1`, [draftMixed]));
    });

    it('rapid repeated publish calls leave exactly one current version (serialised by advisory lock)', async () => {
      await asUser(ids.admin);
      await Promise.all([draftMixed, draftSeparate, draftMixed, draftSeparate].map((d) => rpc('publish_team_distribution', [d]).catch(() => null)));
      await asRoot();
      assert.strictEqual((await rows(`SELECT 1 FROM public.team_distributions WHERE is_current_published`)).length, 1);
    });
  });

  describe('Friday sessions, attendance, QR', () => {
    let openSession = '';
    let closedSession = '';
    let pastSession = '';
    const tokens: Record<string, string> = {};

    it('rejects non-Friday sessions; admins create Friday sessions; members cannot', async () => {
      await asUser(ids.admin);
      const nonFriday = new Date(Date.parse(fridayOffset(400)) + 86400000).toISOString().slice(0, 10);
      await assert.rejects(() => db.query(`INSERT INTO public.friday_sessions (session_date, title) VALUES ($1, 'ليس جمعة')`, [nonFriday]), /chk_session_is_friday/);

      const ins = async (date: string, title: string, open: boolean) =>
        (await rows<{ id: string }>(`INSERT INTO public.friday_sessions (session_date, title, is_open_for_attendance, created_by) VALUES ($1,$2,$3,$4) RETURNING id`,
          [date, title, open, ids.admin]))[0].id;
      openSession = await ins(fridayOffset(400), 'اجتماع مفتوح', true);
      closedSession = await ins(fridayOffset(407), 'اجتماع مغلق', false);
      pastSession = await ins('2026-10-30', 'اجتماع سابق', true);
      await assert.rejects(() => db.query(`INSERT INTO public.friday_sessions (session_date, title) VALUES ($1, 'مكرر')`, [fridayOffset(400)]), /duplicate key/);

      await asUser(ids.m1);
      await assert.rejects(() => db.query(`INSERT INTO public.friday_sessions (session_date, title) VALUES ($1, 'x')`, [fridayOffset(414)]), /row-level security/i);
    });

    it('members read only their own QR token; staff cannot list credentials', async () => {
      for (const m of [ids.m1, ids.m2, ids.m3]) {
        await asUser(m);
        const t = await rpc<string>('get_or_create_my_qr');
        assert.match(t, /^[0-9a-f-]{36}$/);
        assert.strictEqual(await rpc<string>('get_or_create_my_qr'), t, 'idempotent');
        tokens[m] = t;
        assert.strictEqual((await rows(`SELECT id FROM public.qr_credentials`)).length, 1);
      }
      for (const staff of [ids.leader, ids.admin]) {
        await asUser(staff);
        const visible = await rows<{ member_id: string }>(`SELECT member_id FROM public.qr_credentials`);
        assert.deepStrictEqual(visible.map((r) => r.member_id), [staff], 'staff may read only their own credential, never other members\'');
      }
    });

    it('QR verification: valid / invalid / unauthorised', async () => {
      await asUser(ids.leader);
      const ok: any = await rpc('verify_qr_credential', [tokens[ids.m1]]);
      assert.strictEqual(ok.status, 'valid');
      assert.strictEqual(ok.member.id, ids.m1);
      assert.ok(!('phone' in ok.member));
      assert.strictEqual((await rpc<any>('verify_qr_credential', [randomUUID()])).status, 'invalid');
      await asUser(ids.m1);
      await assert.rejects(() => rpc('verify_qr_credential', [tokens[ids.m2]]), /FORBIDDEN/);
      await asAnon();
      await assert.rejects(() => rpc('verify_qr_credential', [tokens[ids.m2]]), /permission denied/i);
    });

    it('records QR attendance with server time; duplicate, invalid, closed and unauthorised are rejected', async () => {
      await asUser(ids.leader);
      const res: any = await rpc('record_attendance', [openSession, 'with_uniform', tokens[ids.m1], null, null]);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.arrival_status, 'on_time'); // far-future session
      assert.strictEqual(res.member.id, ids.m1);

      assert.strictEqual((await rpc<any>('record_attendance', [openSession, 'with_uniform', tokens[ids.m1], null, null])).code, 'DUPLICATE');
      assert.strictEqual((await rpc<any>('record_attendance', [openSession, 'with_uniform', randomUUID(), null, null])).code, 'INVALID_QR');
      assert.strictEqual((await rpc<any>('record_attendance', [closedSession, 'with_uniform', tokens[ids.m2], null, null])).code, 'SESSION_CLOSED');
      assert.strictEqual((await rpc<any>('record_attendance', [openSession, 'bogus', tokens[ids.m2], null, null])).code, 'INVALID_UNIFORM');

      await asUser(ids.m2);
      await assert.rejects(() => rpc('record_attendance', [openSession, 'with_uniform', tokens[ids.m2], null, null]), /FORBIDDEN/);
      await assert.rejects(() => db.query(
        `INSERT INTO public.attendance_records (session_id, member_id, uniform_status, arrival_status, recorded_by) VALUES ($1,$2,'with_uniform','on_time',$2)`,
        [openSession, ids.m2]), /row-level security/i);
    });

    it('the credential decides the member: a spoofed member id is ignored', async () => {
      await asUser(ids.leader);
      const res: any = await rpc('record_attendance', [openSession, 'without_uniform', tokens[ids.m2], ids.m6, 'محاولة تلاعب']);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.member.id, ids.m2);
      await asRoot();
      assert.strictEqual((await rows(`SELECT 1 FROM public.attendance_records WHERE member_id = $1 AND session_id = $2`, [ids.m6, openSession])).length, 0);
    });

    it('manual attendance requires a reason and is audited; late arrival is judged on Cairo time', async () => {
      await asUser(ids.leader);
      assert.strictEqual((await rpc<any>('record_attendance', [openSession, 'with_uniform', null, ids.m4, null])).code, 'REASON_REQUIRED');
      assert.strictEqual((await rpc<any>('record_attendance', [openSession, 'with_uniform', null, null, 'الكاميرا معطلة'])).code, 'MEMBER_REQUIRED');
      const manual: any = await rpc('record_attendance', [openSession, 'with_uniform', null, ids.m4, 'الكاميرا معطلة']);
      assert.strictEqual(manual.success, true);
      const late: any = await rpc('record_attendance', [pastSession, 'without_uniform', tokens[ids.m3], null, null]);
      assert.strictEqual(late.arrival_status, 'late');
      await asRoot();
      const rec = await rows<any>(`SELECT is_manual, manual_reason FROM public.attendance_records WHERE member_id = $1 AND session_id = $2`, [ids.m4, openSession]);
      assert.strictEqual(rec[0].is_manual, true);
      assert.strictEqual(rec[0].manual_reason, 'الكاميرا معطلة');
      const audit = await rows(`SELECT 1 FROM public.audit_logs WHERE action = 'MANUAL_ATTENDANCE_RECORDED'`);
      assert.strictEqual(audit.length, 1);
    });

    it('repeated simultaneous scans of one credential create exactly one record (ON CONFLICT)', async () => {
      await asUser(ids.leader);
      const results: any[] = await Promise.all(Array.from({ length: 6 }, () =>
        rpc('record_attendance', [openSession, 'with_uniform', tokens[ids.m3], null, null])));
      assert.strictEqual(results.filter((r) => r.success).length, 1);
      assert.strictEqual(results.filter((r) => r.code === 'DUPLICATE').length, 5);
      await asRoot();
      assert.strictEqual((await rows(`SELECT 1 FROM public.attendance_records WHERE member_id = $1 AND session_id = $2`, [ids.m3, openSession])).length, 1);
      await assert.rejects(() => db.query(
        `INSERT INTO public.attendance_records (session_id, member_id, uniform_status, arrival_status, recorded_by) VALUES ($1,$2,'with_uniform','on_time',$3)`,
        [openSession, ids.m3, ids.admin]), /uq_session_attendance|duplicate key/);
    });

    it('rotation revokes the old QR (rejected on scan) and issues a replacement; others cannot rotate', async () => {
      await asUser(ids.m5);
      const old = await rpc<string>('get_or_create_my_qr');
      await asUser(ids.m6);
      await assert.rejects(() => rpc('rotate_qr_credential', [ids.m5, 'x']), /FORBIDDEN/);
      await asUser(ids.m5);
      const fresh = await rpc<string>('rotate_qr_credential', [ids.m5, 'فقدان البطاقة']);
      assert.ok(fresh && fresh !== old);
      await asUser(ids.leader);
      assert.strictEqual((await rpc<any>('verify_qr_credential', [old])).status, 'revoked');
      assert.strictEqual((await rpc<any>('record_attendance', [openSession, 'with_uniform', old, null, null])).code, 'REVOKED_QR');
      assert.strictEqual((await rpc<any>('verify_qr_credential', [fresh])).status, 'valid');
      await asUser(ids.admin);
      assert.strictEqual(await rpc('rotate_qr_credential', [ids.m5, 'إعادة إصدار']), null, 'admin never receives a member bearer token');
      await asRoot();
      assert.strictEqual((await rows(`SELECT 1 FROM public.qr_credentials WHERE member_id = $1 AND is_active`, [ids.m5])).length, 1);
      assert.strictEqual((await rows(`SELECT 1 FROM public.audit_logs WHERE action = 'QR_CREDENTIAL_ROTATED'`)).length, 2);
      // No bearer token may ever appear in the audit trail.
      const allTokens = (await rows<{ id: string }>(`SELECT id FROM public.qr_credentials`)).map((r) => r.id);
      const audit = JSON.stringify(await rows(`SELECT details, entity_id FROM public.audit_logs`));
      for (const t of allTokens) assert.ok(!audit.includes(t), 'credential leaked into audit_logs');
    });

    it('attendance correction: admin only, reason required, original timestamp preserved, audited', async () => {
      await asRoot();
      const rec = (await rows<{ id: string; recorded_at: string }>(`SELECT id, recorded_at FROM public.attendance_records WHERE member_id = $1 AND session_id = $2`, [ids.m1, openSession]))[0];
      await asUser(ids.leader);
      await assert.rejects(() => rpc('correct_attendance', [rec.id, null, 'without_uniform', 'تصحيح']), /FORBIDDEN/);
      await asUser(ids.admin);
      assert.strictEqual((await rpc<any>('correct_attendance', [rec.id, null, 'without_uniform', ''])).code, 'REASON_REQUIRED');
      const newTime = new Date(Date.now() - 3600_000).toISOString();
      assert.strictEqual((await rpc<any>('correct_attendance', [rec.id, newTime, 'without_uniform', 'تصحيح خطأ المسح'])).success, true);
      await asRoot();
      const after = (await rows<any>(`SELECT * FROM public.attendance_records WHERE id = $1`, [rec.id]))[0];
      assert.strictEqual(new Date(after.original_recorded_at).getTime(), new Date(rec.recorded_at).getTime());
      assert.strictEqual(after.uniform_status, 'without_uniform');
      assert.strictEqual(after.edit_reason, 'تصحيح خطأ المسح');
      assert.strictEqual(after.edited_by, ids.admin);
      assert.strictEqual((await rows(`SELECT 1 FROM public.audit_logs WHERE action = 'ATTENDANCE_CORRECTED'`)).length, 1);
    });

    it('audit log is append-only for API roles and readable by admins only', async () => {
      await asUser(ids.admin);
      assert.ok((await rows(`SELECT id FROM public.audit_logs`)).length > 0);
      await assert.rejects(() => db.query(`DELETE FROM public.audit_logs`), /permission denied/i);
      await assert.rejects(() => db.query(`UPDATE public.audit_logs SET action = 'x'`), /permission denied/i);
      await asUser(ids.leader);
      assert.strictEqual((await rows(`SELECT id FROM public.audit_logs`)).length, 0);
    });
  });

  describe('weekly responses', () => {
    it('members respond via function only; updating replaces; deadline enforced; no direct writes', async () => {
      await asRoot();
      const sid = (await rows<{ id: string }>(`SELECT id FROM public.friday_sessions WHERE title = 'اجتماع مفتوح'`))[0].id;
      await asUser(ids.m1);
      assert.strictEqual((await rpc<any>('submit_weekly_response', [sid, 'attending'])).success, true);
      assert.strictEqual((await rpc<any>('submit_weekly_response', [sid, 'circumstances'])).success, true);
      assert.strictEqual((await rpc<any>('submit_weekly_response', [sid, 'maybe'])).code, 'INVALID_RESPONSE');
      assert.strictEqual((await rows(`SELECT response FROM public.weekly_responses`)).length, 1);
      await assert.rejects(() => db.query(`INSERT INTO public.weekly_responses (session_id, member_id, response) VALUES ($1,$2,'absent')`, [sid, ids.m1]), /row-level security/i);

      await asRoot();
      await db.query(`UPDATE public.friday_sessions SET response_deadline = now() - interval '1 hour' WHERE id = $1`, [sid]);
      await asUser(ids.m1);
      assert.strictEqual((await rpc<any>('submit_weekly_response', [sid, 'absent'])).code, 'DEADLINE_PASSED');
      await asUser(ids.m2);
      assert.strictEqual((await rows(`SELECT id FROM public.weekly_responses`)).length, 0, 'members cannot read others\' responses');
    });
  });
});
