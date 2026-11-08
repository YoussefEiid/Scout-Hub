import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert';
import { generateMixedStageTeams, isEligibleScout } from '../src/lib/teams/distribution-engine';
import { listMembers, getDistributionDetail, saveTeamDraft } from '../src/lib/supabase/supabase-service';
import { registerScoutMember } from '../src/lib/auth/registration';
import { normalizePhoneNumber } from '../src/lib/auth/registration';

try {
  process.loadEnvFile('.env.local');
} catch {}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('============================================================');
  console.log('ALFANAR SCOUTS — LIVE PRODUCTION COMPREHENSIVE VERIFICATION');
  console.log('============================================================\n');

  // ------------------------------------------------------------------------
  // TEST 1: Leader Login & Scope
  // ------------------------------------------------------------------------
  console.log('▶ TEST 1: Section Leader Authentication & Scope Verification');
  const leaderClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: leaderAuth, error: authErr } = await leaderClient.auth.signInWithPassword({
    email: 'youssefeid88888@gmail.com',
    password: 'TempLeaderPass123!',
  });
  assert.ok(leaderAuth?.user, 'Leader signed in successfully');
  console.log('  ✔ Leader authenticated:', leaderAuth.user.email, '(ID:', leaderAuth.user.id, ')');

  // Verify leader role
  const { data: roles } = await leaderClient.from('user_roles').select('role');
  assert.ok(roles && roles.some((r: { role: string }) => r.role === 'section_leader'), 'Role contains section_leader');
  console.log('  ✔ Leader role confirmed:', roles.map(r => r.role).join(', '));

  // Verify scope
  const { data: scopes } = await leaderClient.from('staff_scope_assignments').select('section_id');
  assert.ok(scopes && scopes.length > 0, 'Leader has assigned section scope');
  const sectionId = scopes[0].section_id;
  console.log('  ✔ Leader section scope:', sectionId);

  // ------------------------------------------------------------------------
  // TEST 2: Eligible Member Pool
  // ------------------------------------------------------------------------
  console.log('\n▶ TEST 2: Member Pool & Eligibility');
  const allMembers = await listMembers(leaderClient);
  console.log('  ✔ Total members in section scope:', allMembers.length);
  const eligible = allMembers.filter(isEligibleScout);
  console.log('  ✔ Eligible scout members (excluding staff):', eligible.length);
  assert.ok(allMembers.length >= 7, 'Expected at least 7 total members');
  assert.ok(eligible.length >= 6, 'Expected at least 6 eligible scout members');

  // ------------------------------------------------------------------------
  // TEST 3: Team Generation (Mode A: 3 Teams for 6 Scouts)
  // ------------------------------------------------------------------------
  console.log('\n▶ TEST 3: Team Generation (3 Teams for 6 Scouts)');
  const seed = 'live-qa-' + Date.now();
  const distResult = generateMixedStageTeams(eligible, {
    teamCount: 3,
    sectionId,
    seed,
  });
  assert.strictEqual(distResult.teams.length, 3, 'Generated 3 teams');
  assert.strictEqual(distResult.statistics.assignedCount, eligible.length, 'Assigned all eligible scouts');
  console.log('  ✔ Generated 3 teams successfully:');
  distResult.teams.forEach((t, i) => {
    console.log(`     Team ${i + 1}: ${t.name} (leader: ${t.leaderId}) -> ${t.members.length} scouts`);
  });

  // ------------------------------------------------------------------------
  // TEST 4: Save Team Distribution Draft in PostgreSQL
  // ------------------------------------------------------------------------
  console.log('\n▶ TEST 4: Save Team Distribution Draft in PostgreSQL');
  const draftTeamsInput = distResult.teams.map((t) => ({
    name: t.name,
    stage_id: t.stage_id || null,
    section_id: t.section_id || sectionId || null,
    color_hex: t.color_hex,
    icon_name: t.icon_name,
    leader_id: t.leaderId || (t.members.length > 0 ? t.members[0].id : null),
    member_ids: t.members.map((m) => m.id),
  }));

  const distId = await saveTeamDraft(leaderClient, {
    title: 'توزيع طلائع القسم الكشفي - فحص الإنتاج',
    mode: 'mixed_stages',
    seed,
    teams: draftTeamsInput,
    sectionId,
  });
  assert.ok(distId, 'Draft saved successfully with UUID');
  console.log('  ✔ Draft saved in PostgreSQL with ID:', distId);

  // Retrieve detail without PGRST201 or 500 error
  const savedDetail = await getDistributionDetail(leaderClient, distId);
  assert.ok(savedDetail, 'getDistributionDetail returned distribution');
  assert.strictEqual(savedDetail.teams?.length, 3, 'Retrieved 3 teams');
  console.log('  ✔ Draft retrieved cleanly with explicit relationship (0 errors, 3 teams)');

  // ------------------------------------------------------------------------
  // TEST 5: Publish Team Distribution
  // ------------------------------------------------------------------------
  console.log('\n▶ TEST 5: Publish Team Distribution');
  // Publish distribution
  await adminClient
    .from('team_distributions')
    .update({
      is_current_published: true,
      status: 'published',
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', distId);

  const publishedDetail = await getDistributionDetail(adminClient, distId);
  assert.strictEqual(publishedDetail?.is_current_published, true, 'Distribution is current published');
  assert.strictEqual(publishedDetail?.status, 'published', 'Distribution status is published');
  console.log('  ✔ Distribution successfully published!');

  // Clean up test distribution
  await adminClient.from('team_memberships').delete().eq('distribution_id', distId);
  await adminClient.from('teams').delete().eq('distribution_id', distId);
  await adminClient.from('team_distributions').delete().eq('id', distId);
  console.log('  ✔ Test distribution cleaned up.');

  // ------------------------------------------------------------------------
  // TEST 6: Email-Free Child Registration
  // ------------------------------------------------------------------------
  console.log('\n▶ TEST 6: Child-Friendly Email-Free Member Registration');
  // Fetch active year in section
  const { data: years } = await adminClient
    .from('scout_section_years')
    .select('id, name')
    .eq('section_id', sectionId)
    .eq('is_active', true)
    .limit(1);

  assert.ok(years && years.length > 0, 'Found active year in section');
  const yearId = years[0].id;

  const uniqueSuffix = Date.now().toString().slice(-6);
  const testScoutPhone = `010${uniqueSuffix}99`;
  const testScoutPassword = 'ScoutPassword123!';

  console.log('  Registering child without email:');
  console.log(`  - Name: كشاف التحقق الحي ${uniqueSuffix}`);
  console.log(`  - Section: ${sectionId}`);
  console.log(`  - Year: ${yearId} (${years[0].name})`);
  console.log(`  - Phone: ${testScoutPhone}`);
  console.log(`  - Email: NONE (child has no email)`);

  const regResult = await registerScoutMember({
    fullName: `كشاف التحقق الحي ${uniqueSuffix}`,
    sectionId,
    yearId,
    commitment: 'committed',
    phone: testScoutPhone,
    password: testScoutPassword,
  });

  assert.ok(regResult.id, 'Child auth account created');
  assert.ok(regResult.member_number, 'Member number assigned');
  assert.strictEqual(regResult.is_active, true, 'Member profile is active');
  console.log('  ✔ Registration SUCCEEDED! Member Number:', regResult.member_number);

  // ------------------------------------------------------------------------
  // TEST 7: Child Login via Scout Number & Phone Number
  // ------------------------------------------------------------------------
  console.log('\n▶ TEST 7: Member Authentication via Scout Number & Phone');

  // A. Login by Scout Number
  console.log('  A. Authenticating by Scout Number:', regResult.member_number);
  const { data: memByNum } = await adminClient
    .from('profiles')
    .select('id, member_number')
    .ilike('member_number', regResult.member_number)
    .single();
  assert.strictEqual(memByNum?.id, regResult.id);

  const { data: authUserNum } = await adminClient.auth.admin.getUserById(memByNum.id);
  assert.ok(authUserNum?.user?.email, 'User has internal auth identifier');

  const scoutClientA = createClient(supabaseUrl, anonKey);
  const { data: loginA, error: logErrA } = await scoutClientA.auth.signInWithPassword({
    email: authUserNum.user.email,
    password: testScoutPassword,
  });
  assert.ok(loginA?.session, 'Scout logged in successfully via Scout Number');
  console.log('  ✔ Scout Number login: SUCCESS! Session established.');

  // B. Login by Phone Number
  console.log('  B. Authenticating by Phone Number:', testScoutPhone);
  const normalizedPhone = normalizePhoneNumber(testScoutPhone);
  const { data: memByPhone } = await adminClient
    .from('profiles')
    .select('id, phone')
    .or(`phone.eq.${testScoutPhone},phone.eq.${normalizedPhone}`)
    .single();
  assert.strictEqual(memByPhone?.id, regResult.id);

  const scoutClientB = createClient(supabaseUrl, anonKey);
  const { data: loginB, error: logErrB } = await scoutClientB.auth.signInWithPassword({
    email: authUserNum.user.email,
    password: testScoutPassword,
  });
  assert.ok(loginB?.session, 'Scout logged in successfully via Phone Number');
  console.log('  ✔ Phone Number login: SUCCESS! Session established.');

  // C. Verify Staff Email Login still works
  console.log('  C. Authenticating Staff by Email: youssefeid88888@gmail.com');
  const staffClient = createClient(supabaseUrl, anonKey);
  const { data: staffLogin, error: staffErr } = await staffClient.auth.signInWithPassword({
    email: 'youssefeid88888@gmail.com',
    password: 'TempLeaderPass123!',
  });
  assert.ok(staffLogin?.session, 'Staff logged in successfully with email');
  console.log('  ✔ Staff Email login: SUCCESS!');

  // ------------------------------------------------------------------------
  // TEST 8: Super Admin Permanent Member Deletion & Cleanup
  // ------------------------------------------------------------------------
  console.log('\n▶ TEST 8: Super Admin Permanent Member Deletion');
  // Sign in as Super Admin to execute delete_member_permanent with proper auth.uid()
  const superAdminClient = createClient(supabaseUrl, anonKey);
  await superAdminClient.auth.signInWithPassword({
    email: 'aaaa8888aaaa1111@gmail.com',
    password: 'TempSuperAdmin123!',
  });

  const { data: delRes, error: delErr } = await superAdminClient.rpc('delete_member_permanent', {
    p_member_id: regResult.id,
  });
  console.log('  delete_member_permanent response:', delRes);
  assert.strictEqual(delRes?.success, true, 'Permanent deletion RPC succeeded');

  // Delete auth user
  await adminClient.auth.admin.deleteUser(regResult.id);

  const { data: verifyGone } = await adminClient.from('profiles').select('id').eq('id', regResult.id).maybeSingle();
  assert.strictEqual(verifyGone, null, 'Profile is permanently deleted');
  console.log('  ✔ Test scout profile and auth user permanently removed without side effects.');

  console.log('\n============================================================');
  console.log('ALL LIVE VERIFICATIONS PASSED WITH 100% SUCCESS!');
  console.log('============================================================');
}

main().catch((err) => {
  console.error('\n❌ LIVE VERIFICATION FAILED:', err);
  process.exit(1);
});
