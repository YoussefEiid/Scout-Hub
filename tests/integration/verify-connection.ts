process.loadEnvFile('.env.local');

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  console.log('Testing connectivity...');
  const anonClient = createClient(url, anonKey);
  const adminClient = createClient(url, serviceKey);

  // 1. Test Anon connection
  const { data: anonData, error: anonError } = await anonClient.from('profiles').select('count', { count: 'exact', head: true });
  console.log('Anon connection test:', anonError ? `Error: ${anonError.message}` : `Success! Rows accessible: ${anonData ?? 0}`);

  // 2. Test Admin / Service Role connection
  const { data: adminData, error: adminError } = await adminClient.from('profiles').select('id, member_number, full_name, stage_id').limit(3);
  console.log('Admin connection test:', adminError ? `Error: ${adminError.message}` : `Success! Existing member rows: ${adminData?.length}`);

  // 3. Test Auth Admin API
  const { data: authUsers, error: authError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 3 });
  console.log('Auth admin test:', authError ? `Error: ${authError.message}` : `Success! Auth users count: ${authUsers?.users?.length}`);
}

main().catch(err => {
  console.error('Fatal connection error:', err.message);
  process.exit(1);
});
