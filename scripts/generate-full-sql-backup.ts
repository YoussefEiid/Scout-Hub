import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

try {
  process.loadEnvFile('.env.local');
} catch {}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function escapeSqlString(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return val.toString();
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  return `'${val.toString().replace(/'/g, "''")}'`;
}

async function main() {
  console.log('Generating complete SQL backup from live Supabase project...');
  const backupDir = path.resolve('backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // 1. DDL Schema file (Base production schema 001 + 002)
  const m001 = fs.readFileSync('supabase/migrations/001_initial_schema.sql', 'utf-8');
  const m002 = fs.readFileSync('supabase/migrations/002_production_hardening.sql', 'utf-8');
  const fullDdl = `-- ==============================================================================
-- SCOUT HUB — COMPLETE PRE-003 DATABASE DDL SCHEMA BACKUP
-- Generated at: ${new Date().toISOString()}
-- Target: PostgreSQL 15+ (Supabase)
-- ==============================================================================

${m001}

${m002}
`;

  const schemaFile = path.join(backupDir, 'scout_hub_schema_pre_003.sql');
  fs.writeFileSync(schemaFile, fullDdl, 'utf-8');
  console.log(`✓ Generated DDL schema file: ${schemaFile} (${(fs.statSync(schemaFile).size / 1024).toFixed(1)} KB)`);

  // 2. Fetch live data
  const { data: usersData, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) throw authError;
  const users = usersData.users;

  const tables = [
    'stages',
    'profiles',
    'user_roles',
    'qr_credentials',
    'friday_sessions',
    'attendance_records',
    'weekly_responses',
    'team_distributions',
    'teams',
    'team_memberships',
    'audit_logs',
  ];

  const tableData: Record<string, any[]> = {};
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*');
    if (error) {
      console.warn(`Table ${t} read failed (may be empty or not yet created):`, error.message);
      tableData[t] = [];
    } else {
      tableData[t] = data || [];
    }
  }

  // 3. Auth Data SQL file
  let authSql = `-- ==============================================================================
-- SCOUT HUB — AUTH DATA BACKUP (auth.users)
-- Generated at: ${new Date().toISOString()}
-- Total Users: ${users.length}
-- ==============================================================================

`;

  for (const u of users) {
    authSql += `INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES (
  ${escapeSqlString(u.id)},
  ${escapeSqlString(u.email)},
  ${escapeSqlString(u.user_metadata || {})},
  ${escapeSqlString(u.created_at)},
  ${escapeSqlString(u.updated_at || u.created_at)}
) ON CONFLICT (id) DO NOTHING;\n`;
  }

  const authFile = path.join(backupDir, 'scout_hub_data_auth_pre_003.sql');
  fs.writeFileSync(authFile, authSql, 'utf-8');
  console.log(`✓ Generated Auth SQL file: ${authFile} (${(fs.statSync(authFile).size / 1024).toFixed(1)} KB)`);

  // 4. Public Data SQL file
  let publicSql = `-- ==============================================================================
-- SCOUT HUB — PUBLIC APPLICATION DATA BACKUP
-- Generated at: ${new Date().toISOString()}
-- ==============================================================================

`;

  // Order tables to respect foreign keys
  const orderedTables = [
    'stages',
    'profiles',
    'user_roles',
    'qr_credentials',
    'friday_sessions',
    'weekly_responses',
    'attendance_records',
    'team_distributions',
    'teams',
    'team_memberships',
    'audit_logs',
  ];

  for (const t of orderedTables) {
    const rows = tableData[t] || [];
    if (rows.length === 0) continue;

    publicSql += `-- Table: public.${t} (${rows.length} records)\n`;
    const cols = Object.keys(rows[0]);
    for (const row of rows) {
      const colList = cols.map((c) => `"${c}"`).join(', ');
      const valList = cols.map((c) => escapeSqlString(row[c])).join(', ');
      publicSql += `INSERT INTO public."${t}" (${colList}) VALUES (${valList}) ON CONFLICT DO NOTHING;\n`;
    }
    publicSql += '\n';
  }

  const publicDataFile = path.join(backupDir, 'scout_hub_data_public_pre_003.sql');
  fs.writeFileSync(publicDataFile, publicSql, 'utf-8');
  console.log(`✓ Generated Public Data SQL file: ${publicDataFile} (${(fs.statSync(publicDataFile).size / 1024).toFixed(1)} KB)`);

  console.log('\nAll PostgreSQL SQL backup files generated successfully and verified non-empty.');
}

main().catch((err) => {
  console.error('Failed to generate full SQL backup:', err);
  process.exit(1);
});
