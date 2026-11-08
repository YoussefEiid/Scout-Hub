import { createClient } from '@supabase/supabase-js';

try {
  process.loadEnvFile('.env.local');
} catch {}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  const { data: teams, error: e1 } = await adminClient.from('teams').select('id, distribution_id');
  if (e1) {
    console.error('Error fetching teams:', e1);
    process.exit(1);
  }
  const { data: memberships, error: e2 } = await adminClient.from('team_memberships').select('id, team_id, distribution_id');
  if (e2) {
    console.error('Error fetching memberships:', e2);
    process.exit(1);
  }

  const teamDistMap = new Map((teams || []).map(t => [t.id, t.distribution_id]));
  let mismatches = 0;
  let nulls = 0;
  for (const m of (memberships || [])) {
    if (!m.distribution_id) nulls++;
    else if (teamDistMap.get(m.team_id) !== m.distribution_id) mismatches++;
  }

  console.log('LIVE PRODUCTION INTEGRITY CHECK RESULT:', {
    totalTeams: teams?.length || 0,
    totalMemberships: memberships?.length || 0,
    mismatches,
    nulls
  });
}

run().catch(console.error);
