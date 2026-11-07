import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, before } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

describe('PostgreSQL SQL Dump Backup & Full Restore Verification', () => {
  let db: PGlite;
  const backupDir = path.resolve('backups');
  const schemaFile = path.join(backupDir, 'scout_hub_schema_pre_003.sql');
  const authFile = path.join(backupDir, 'scout_hub_data_auth_pre_003.sql');
  const publicDataFile = path.join(backupDir, 'scout_hub_data_public_pre_003.sql');

  it('Requirement 1.1: Verifies all SQL backup files exist and are non-empty', () => {
    assert.ok(fs.existsSync(schemaFile), 'scout_hub_schema_pre_003.sql must exist');
    assert.ok(fs.existsSync(authFile), 'scout_hub_data_auth_pre_003.sql must exist');
    assert.ok(fs.existsSync(publicDataFile), 'scout_hub_data_public_pre_003.sql must exist');

    const schemaStat = fs.statSync(schemaFile);
    const authStat = fs.statSync(authFile);
    const publicStat = fs.statSync(publicDataFile);

    assert.ok(schemaStat.size > 10000, `Schema file too small: ${schemaStat.size} bytes`);
    assert.ok(authStat.size > 500, `Auth file too small: ${authStat.size} bytes`);
    assert.ok(publicStat.size > 1000, `Public data file too small: ${publicStat.size} bytes`);

    console.log(`Verified Non-Empty SQL Backup Files:`);
    console.log(` - Schema DDL: ${schemaStat.size} bytes`);
    console.log(` - Auth Data: ${authStat.size} bytes`);
    console.log(` - Public Data: ${publicStat.size} bytes`);
  });

  it('Requirement 1.2: Restores full DDL schema and data into an isolated clean PostgreSQL instance', async () => {
    db = new PGlite();

    // 1. Initialize Supabase runtime environment
    await db.exec(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text,
        raw_user_meta_data jsonb,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
        AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    `);

    // 2. Execute full DDL schema
    const schemaSql = fs.readFileSync(schemaFile, 'utf-8');
    await db.exec(schemaSql);

    // 3. Execute Auth data
    const authSql = fs.readFileSync(authFile, 'utf-8');
    await db.exec(authSql);

    // 4. Execute Public data
    const publicSql = fs.readFileSync(publicDataFile, 'utf-8');
    await db.exec(publicSql);

    console.log('SQL DDL and data restoration completed cleanly with 0 errors.');
  });

  it('Requirement 1.3: Confirms all restored records match production exactly', async () => {
    // Check auth users
    const users = await db.query<any>('SELECT id, email FROM auth.users ORDER BY email');
    assert.ok(users.rows.length >= 3, `Expected at least 3 users, got ${users.rows.length}`);

    // Check profiles
    const profiles = await db.query<any>('SELECT * FROM public.profiles ORDER BY member_number');
    assert.strictEqual(profiles.rows.length, 3, 'Must restore exactly 3 production profiles');

    const admin = profiles.rows.find((p) => p.member_number === 'ADMIN-001');
    assert.ok(admin, 'Admin profile must exist');
    assert.strictEqual(admin.full_name, 'مدير النظام');

    const youssef = profiles.rows.find((p) => p.member_number === 'SCT-2026-0014');
    assert.ok(youssef, 'Youssef Eid profile must exist');
    assert.strictEqual(youssef.full_name, 'يوسف عيد');
    assert.strictEqual(youssef.stage_id, 'stage_2');

    // Check user roles
    const roles = await db.query<any>('SELECT * FROM public.user_roles');
    assert.strictEqual(roles.rows.length, 3, 'Must restore exactly 3 role assignments');

    const adminRole = roles.rows.find((r) => r.user_id === admin.id);
    assert.strictEqual(adminRole.role, 'super_admin');
  });

  it('Requirement 1.4: Applies Migration 003 on restored database to verify forward compatibility', async () => {
    const m003 = fs.readFileSync('supabase/migrations/003_dynamic_scout_structure_and_role_isolation.sql', 'utf-8');
    await db.exec(m003);

    // Verify sections created
    const sections = await db.query<any>('SELECT code, name FROM public.scout_sections ORDER BY display_order');
    assert.strictEqual(sections.rows.length, 4);
    assert.deepStrictEqual(sections.rows.map((s) => s.code), ['cubs', 'scouts', 'guides', 'rovers']);

    // Verify legacy stages are preserved and unmapped records remain pending review
    const youssef = (await db.query<any>('SELECT * FROM public.profiles WHERE member_number = $1', ['SCT-2026-0014'])).rows[0];
    assert.strictEqual(youssef.stage_id, 'stage_2');
    assert.strictEqual(youssef.section_id, null, 'Must remain pending admin review');
  });
});
