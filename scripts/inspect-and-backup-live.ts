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

async function main() {
  console.log('Connecting to live Supabase project:', supabaseUrl);

  const backupDir = path.resolve('backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `supabase_live_backup_${timestamp}.json`);

  // 1. Auth Users
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) {
    console.error('Error fetching auth users:', authError);
    process.exit(1);
  }
  const users = authData.users;
  console.log(`Found ${users.length} live Auth Users.`);

  // 2. Fetch all public tables
  const tables = [
    'user_roles',
    'stages',
    'profiles',
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
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) {
      console.warn(`Table ${table} query failed (might not exist yet):`, error.message);
      tableData[table] = [];
    } else {
      console.log(`Table ${table}: ${data.length} records`);
      tableData[table] = data;
    }
  }

  // 3. Storage buckets
  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
  console.log(`Storage buckets found: ${buckets?.length || 0}`);

  const storageData: Record<string, any[]> = {};
  if (buckets) {
    for (const bucket of buckets) {
      const { data: files } = await supabase.storage.from(bucket.name).list();
      storageData[bucket.name] = files || [];
      console.log(`Bucket ${bucket.name}: ${files?.length || 0} objects`);
    }
  }

  // Complete Backup Structure
  const fullBackup = {
    metadata: {
      timestamp: new Date().toISOString(),
      supabaseUrl,
      projectRef: supabaseUrl.replace('https://', '').split('.')[0],
      tier: 'Supabase Free',
      exportedBy: 'Scout Hub Production Backup Script',
    },
    auth: {
      userCount: users.length,
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        phone: u.phone,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        app_metadata: u.app_metadata,
        user_metadata: u.user_metadata,
      })),
    },
    publicTables: tableData,
    storage: {
      buckets: buckets || [],
      objects: storageData,
    },
  };

  fs.writeFileSync(backupFile, JSON.stringify(fullBackup, null, 2), 'utf-8');
  console.log(`\nComplete backup successfully saved to:\n${backupFile}`);

  // Summary for review
  console.log('\n--- LIVE PRODUCTION DATA SUMMARY ---');
  console.log('Auth Users:');
  for (const u of users) {
    const userRoles = tableData.user_roles?.filter((r) => r.user_id === u.id).map((r) => r.role);
    const profile = tableData.profiles?.find((p) => p.id === u.id);
    console.log(`  - ID: ${u.id}`);
    console.log(`    Email: ${u.email}`);
    console.log(`    Roles in DB: ${userRoles?.join(', ') || 'none'}`);
    console.log(`    Member Number: ${profile?.member_number || 'N/A'}`);
    console.log(`    Full Name: ${profile?.full_name || 'N/A'}`);
    console.log(`    Stage ID: ${profile?.stage_id || 'N/A'}`);
  }
}

main().catch((err) => {
  console.error('Fatal error during backup:', err);
  process.exit(1);
});
