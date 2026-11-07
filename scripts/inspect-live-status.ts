import { createClient } from '@supabase/supabase-js';

try {
  process.loadEnvFile('.env.local');
} catch {}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('Inspecting live database tables on project:', supabaseUrl);

  const t1 = await supabase.from('scout_sections').select('count');
  const t2 = await supabase.from('scout_section_years').select('count');
  const t3 = await supabase.from('staff_scope_assignments').select('count');
  const t4 = await supabase.from('stages').select('count');
  const t5 = await supabase.from('profiles').select('count');
  const t6 = await supabase.from('user_roles').select('*');

  console.log('scout_sections status:', t1.error ? `NOT FOUND (${t1.error.message})` : `EXISTS (${t1.data?.length || 0} rows)`);
  console.log('scout_section_years status:', t2.error ? `NOT FOUND (${t2.error.message})` : `EXISTS (${t2.data?.length || 0} rows)`);
  console.log('staff_scope_assignments status:', t3.error ? `NOT FOUND (${t3.error.message})` : `EXISTS (${t3.data?.length || 0} rows)`);
  console.log('stages status:', t4.error ? `NOT FOUND (${t4.error.message})` : `EXISTS (${t4.data?.length || 0} rows)`);
  console.log('profiles status:', t5.error ? `NOT FOUND (${t5.error.message})` : `EXISTS (${t5.data?.length || 0} rows)`);
  console.log('user_roles:', t6.data?.map(r => ({ user_id: r.user_id, role: r.role })));
}

main().catch(console.error);
