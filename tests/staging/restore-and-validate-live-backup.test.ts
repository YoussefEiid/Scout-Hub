import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, before } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

describe('Staging Restore & Migration 003 Validation with Real Production Backup', () => {
  let db: PGlite;
  let liveBackup: any;

  before(async () => {
    // 1. Load latest backup file
    const backupDir = path.resolve('backups');
    const backupFiles = fs.readdirSync(backupDir).filter((f) => f.endsWith('.json')).sort().reverse();
    assert.ok(backupFiles.length > 0, 'No backup files found in backups/');
    const latestBackup = path.join(backupDir, backupFiles[0]);
    liveBackup = JSON.parse(fs.readFileSync(latestBackup, 'utf-8'));
    console.log(`Loaded real live backup from: ${backupFiles[0]}`);

    // 2. Initialize isolated test database
    db = new PGlite();

    await db.exec(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, raw_user_meta_data jsonb);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
        AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
    `);

    // 3. Apply base migrations 001 and 002
    const m001 = fs.readFileSync('supabase/migrations/001_initial_schema.sql', 'utf-8');
    const m002 = fs.readFileSync('supabase/migrations/002_production_hardening.sql', 'utf-8');
    await db.exec(m001);
    await db.exec(m002);

    // 4. Restore real production data
    console.log('Restoring live production data into isolated staging instance...');

    // Restore Auth Users
    for (const u of liveBackup.auth.users) {
      await db.query(
        `INSERT INTO auth.users (id, email, raw_user_meta_data)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [u.id, u.email, JSON.stringify(u.user_metadata || {})]
      );
    }

    // Restore Profiles
    for (const p of liveBackup.publicTables.profiles || []) {
      await db.query(
        `INSERT INTO public.profiles (id, member_number, full_name, phone, stage_id, initial_commitment, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [p.id, p.member_number, p.full_name, p.phone, p.stage_id, p.initial_commitment || 'وعد الكشافة', p.is_active, p.created_at]
      );
    }

    // Restore Roles
    for (const r of liveBackup.publicTables.user_roles || []) {
      await db.query(
        `INSERT INTO public.user_roles (id, user_id, role, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, role) DO NOTHING`,
        [r.id, r.user_id, r.role, r.created_at || new Date().toISOString()]
      );
    }

    // Restore QR Credentials
    for (const q of liveBackup.publicTables.qr_credentials || []) {
      await db.query(
        `INSERT INTO public.qr_credentials (id, member_id, is_active, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [q.id, q.member_id, q.is_active, q.created_at || new Date().toISOString()]
      );
    }

    console.log('Production data restored cleanly into staging.');
  });

  it('Step 1: Confirms pre-migration state of live records', async () => {
    const profiles = await db.query<any>('SELECT * FROM public.profiles ORDER BY member_number');
    assert.strictEqual(profiles.rows.length, 3);

    const youssef = profiles.rows.find((p) => p.full_name === 'يوسف عيد');
    assert.ok(youssef, 'Youssef Eid record must exist in pre-migration state');
    assert.strictEqual(youssef.member_number, 'SCT-2026-0014');
    assert.strictEqual(youssef.stage_id, 'stage_2');

    const superAdmin = profiles.rows.find((p) => p.member_number === 'ADMIN-001');
    assert.ok(superAdmin, 'Super Admin record must exist');

    const adminRole = await db.query<any>(
      `SELECT * FROM public.user_roles WHERE user_id = $1 AND role = 'super_admin'`,
      [superAdmin.id]
    );
    assert.strictEqual(adminRole.rows.length, 1);
  });

  it('Step 2: Applies Migration 003 onto real production data without error', async () => {
    const m003 = fs.readFileSync('supabase/migrations/003_dynamic_scout_structure_and_role_isolation.sql', 'utf-8');
    await db.exec(m003);
    console.log('Migration 003 executed successfully on staging database!');
  });

  it('Step 3: Confirms all production records survived with 100% fidelity and ambiguous stages are pending review', async () => {
    const profiles = await db.query<any>('SELECT * FROM public.profiles ORDER BY member_number');
    assert.strictEqual(profiles.rows.length, 3);

    const youssef = profiles.rows.find((p) => p.full_name === 'يوسف عيد');
    assert.strictEqual(youssef.member_number, 'SCT-2026-0014');
    assert.strictEqual(youssef.is_active, true);
    assert.strictEqual(youssef.stage_id, 'stage_2', 'Original stage_id must be preserved');
    // Fail-safe check: Ambiguous generic stage must NOT be forcefully published into a guessed section
    assert.strictEqual(youssef.section_id, null, 'Ambiguous stage must be pending administrative review');
    assert.strictEqual(youssef.year_id, null, 'Year must remain null until admin explicitly assigns');

    const superAdmin = profiles.rows.find((p) => p.member_number === 'ADMIN-001');
    assert.strictEqual(superAdmin.member_number, 'ADMIN-001');

    const adminRole = await db.query<any>(
      `SELECT * FROM public.user_roles WHERE user_id = $1 AND role = 'super_admin'`,
      [superAdmin.id]
    );
    assert.strictEqual(adminRole.rows.length, 1);

    // Super Admin reviews and explicitly assigns Youssef to Scouts section and Year 1
    const scoutsSec = (await db.query<any>(`SELECT id FROM public.scout_sections WHERE code = 'scouts'`)).rows[0].id;
    const scoutsYr1 = (await db.query<any>(`SELECT id FROM public.scout_section_years WHERE section_id = $1 AND display_order = 1`, [scoutsSec])).rows[0].id;

    await db.query(
      `UPDATE public.profiles SET section_id = $1, year_id = $2 WHERE id = $3`,
      [scoutsSec, scoutsYr1, youssef.id]
    );

    const updatedYoussef = (await db.query<any>(`SELECT * FROM public.profiles WHERE id = $1`, [youssef.id])).rows[0];
    assert.strictEqual(updatedYoussef.section_id, scoutsSec);
    assert.strictEqual(updatedYoussef.year_id, scoutsYr1);
  });

  it('Step 4: Authenticated test matrix across all 6 personas', async () => {
    // Grant execution for test simulation
    await db.exec(`GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role;`);

    // Fetch existing Super Admin
    const superAdminRes = await db.query<any>(
      `SELECT id FROM public.profiles WHERE member_number = 'ADMIN-001'`
    );
    const superAdminId = superAdminRes.rows[0].id;

    // Create Section Leader A (Cubs Leader)
    const leaderAId = 'a1111111-1111-1111-1111-111111111111';
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'leader.a@cubs.local')`, [leaderAId]);
    await db.query(`INSERT INTO public.profiles (id, member_number, full_name, initial_commitment, is_active) VALUES ($1, 'LDR-CUBS', 'قائد الأشبال', 'committed', true)`, [leaderAId]);
    await db.query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'section_leader')`, [leaderAId]);

    // Create Section Leader B (Scouts Leader)
    const leaderBId = 'b2222222-2222-2222-2222-222222222222';
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'leader.b@scouts.local')`, [leaderBId]);
    await db.query(`INSERT INTO public.profiles (id, member_number, full_name, initial_commitment, is_active) VALUES ($1, 'LDR-SCOUT', 'قائد الفتيان', 'committed', true)`, [leaderBId]);
    await db.query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'section_leader')`, [leaderBId]);

    // Create Assistant Leader (Assigned to Cubs)
    const asstId = 'c3333333-3333-3333-3333-333333333333';
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'asst.cubs@cubs.local')`, [asstId]);
    await db.query(`INSERT INTO public.profiles (id, member_number, full_name, initial_commitment, is_active) VALUES ($1, 'AST-CUBS', 'مساعد الأشبال', 'committed', true)`, [asstId]);
    await db.query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'assistant_leader')`, [asstId]);

    // Get section IDs
    const cubsSec = (await db.query<any>(`SELECT id FROM public.scout_sections WHERE code = 'cubs'`)).rows[0].id;
    const scoutsSec = (await db.query<any>(`SELECT id FROM public.scout_sections WHERE code = 'scouts'`)).rows[0].id;

    // Super Admin assigns scopes
    await db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${superAdminId}', false);`);
    await db.query(`SELECT public.assign_staff_scope($1, $2, NULL)`, [leaderAId, cubsSec]);
    await db.query(`SELECT public.assign_staff_scope($1, $2, NULL)`, [leaderBId, scoutsSec]);
    await db.query(`SELECT public.assign_staff_scope($1, $2, NULL)`, [asstId, cubsSec]);

    // 1. Super Admin scope check: Has access to EVERYTHING
    const saCubsAccess = await db.query<any>(`SELECT public.has_scope_access($1, $2, NULL) as access`, [superAdminId, cubsSec]);
    const saScoutsAccess = await db.query<any>(`SELECT public.has_scope_access($1, $2, NULL) as access`, [superAdminId, scoutsSec]);
    assert.strictEqual(saCubsAccess.rows[0].access, true);
    assert.strictEqual(saScoutsAccess.rows[0].access, true);

    // 2. Leader A (Cubs): Has Cubs access, DENIED Scouts access
    const ldrACubs = await db.query<any>(`SELECT public.has_scope_access($1, $2, NULL) as access`, [leaderAId, cubsSec]);
    const ldrAScouts = await db.query<any>(`SELECT public.has_scope_access($1, $2, NULL) as access`, [leaderAId, scoutsSec]);
    assert.strictEqual(ldrACubs.rows[0].access, true);
    assert.strictEqual(ldrAScouts.rows[0].access, false);

    // 3. Leader B (Scouts): Has Scouts access, DENIED Cubs access
    const ldrBCubs = await db.query<any>(`SELECT public.has_scope_access($1, $2, NULL) as access`, [leaderBId, cubsSec]);
    const ldrBScouts = await db.query<any>(`SELECT public.has_scope_access($1, $2, NULL) as access`, [leaderBId, scoutsSec]);
    assert.strictEqual(ldrBCubs.rows[0].access, false);
    assert.strictEqual(ldrBScouts.rows[0].access, true);

    // 4. Assistant Leader: Has Cubs access, DENIED Scouts access
    const asstCubs = await db.query<any>(`SELECT public.has_scope_access($1, $2, NULL) as access`, [asstId, cubsSec]);
    const asstScouts = await db.query<any>(`SELECT public.has_scope_access($1, $2, NULL) as access`, [asstId, scoutsSec]);
    assert.strictEqual(asstCubs.rows[0].access, true);
    assert.strictEqual(asstScouts.rows[0].access, false);

    // 5. Ordinary Member (Youssef Eid): DENIED administrative scope
    const youssefId = '1cd14e97-bfb4-475d-948c-beb6fbe6e873';
    const memberAccess = await db.query<any>(`SELECT public.has_scope_access($1, $2, NULL) as access`, [youssefId, scoutsSec]);
    assert.strictEqual(memberAccess.rows[0].access, false);

    // 6. Anonymous: DENIED everything
    const anonAccess = await db.query<any>(`SELECT public.has_scope_access(NULL, $1, NULL) as access`, [scoutsSec]);
    assert.strictEqual(anonAccess.rows[0].access, false);
  });

  it('Step 5: Verifies RLS read isolation on live data', async () => {
    const leaderAId = 'a1111111-1111-1111-1111-111111111111'; // Cubs Leader
    const youssefId = '1cd14e97-bfb4-475d-948c-beb6fbe6e873'; // Member in Scouts

    // Cubs Leader queries profiles: should NOT see Youssef Eid (who is in Scouts)
    await db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${leaderAId}', false);`);
    const cubsView = await db.query<any>(`SELECT full_name FROM public.profiles WHERE id = '${youssefId}'`);
    assert.strictEqual(cubsView.rows.length, 0, 'Cubs Leader MUST NOT see members in Scouts section');

    // Youssef Eid queries profiles: should ONLY see himself
    await db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${youssefId}', false);`);
    const youssefView = await db.query<any>(`SELECT full_name FROM public.profiles`);
    assert.strictEqual(youssefView.rows.length, 1);
    assert.strictEqual(youssefView.rows[0].full_name, 'يوسف عيد');
  });

  it('Step 6: Verifies cross-scope QR attendance scanning is blocked', async () => {
    const leaderAId = 'a1111111-1111-1111-1111-111111111111'; // Cubs Leader
    const youssefId = '1cd14e97-bfb4-475d-948c-beb6fbe6e873'; // Scouts member

    // Fetch Youssef's QR token (as root)
    await db.exec(`RESET ROLE;`);
    const qrRes = await db.query<any>(`SELECT id FROM public.qr_credentials WHERE member_id = '${youssefId}'`);
    const youssefQrToken = qrRes.rows[0].id;

    // Cubs leader attempts to verify Youssef's QR token
    await db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${leaderAId}', false);`);
    const verifyResult = await db.query<any>(`SELECT public.verify_qr_credential($1) as result`, [youssefQrToken]);
    assert.strictEqual(verifyResult.rows[0].result.status, 'unauthorized_scope');
    assert.strictEqual(verifyResult.rows[0].result.member, undefined, 'Private member info must not be leaked');
  });
});
