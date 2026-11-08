import assert from 'node:assert';
import crypto from 'node:crypto';
import { describe, it, before, after } from 'node:test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

try {
  process.loadEnvFile('.env.local');
} catch {}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

describe('Live Supabase Production E2E Verification', () => {
  let adminClient: SupabaseClient;

  // Test identities
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const adminEmail = `e2e.admin.${randomSuffix}@scouthub-test.local`;
  const adminPassword = `AdminPass_${crypto.randomBytes(16).toString('hex')}!`;
  let adminUserId = '';
  let adminAuthClient: SupabaseClient;

  const memberEmail = `e2e.member.${randomSuffix}@scouthub-test.local`;
  const memberPassword = `MemberPass_${crypto.randomBytes(16).toString('hex')}!`;
  let memberUserId = '';
  let memberAuthClient: SupabaseClient;
  let memberQrToken = '';

  let testSessionId = '';
  let testDistributionId = '';

  before(async () => {
    adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  after(async () => {
    // Clean up test data
    console.log('Cleaning up isolated E2E test data...');
    if (testDistributionId) {
      await adminClient.from('team_memberships').delete().like('id', `%${randomSuffix}%`);
      await adminClient.from('teams').delete().eq('distribution_id', testDistributionId);
      await adminClient.from('team_distributions').delete().eq('id', testDistributionId);
    }
    if (testSessionId) {
      await adminClient.from('attendance_records').delete().eq('session_id', testSessionId);
      await adminClient.from('weekly_responses').delete().eq('session_id', testSessionId);
      await adminClient.from('friday_sessions').delete().eq('id', testSessionId);
    }
    if (memberUserId) {
      await adminClient.from('audit_logs').delete().eq('actor_id', memberUserId);
      await adminClient.from('qr_credentials').delete().eq('member_id', memberUserId);
      await adminClient.from('user_roles').delete().eq('user_id', memberUserId);
      await adminClient.from('profiles').delete().eq('id', memberUserId);
      await adminClient.auth.admin.deleteUser(memberUserId);
    }
    if (adminUserId) {
      await adminClient.from('audit_logs').delete().eq('actor_id', adminUserId);
      await adminClient.from('user_roles').delete().eq('user_id', adminUserId);
      await adminClient.from('profiles').delete().eq('id', adminUserId);
      await adminClient.auth.admin.deleteUser(adminUserId);
    }
    console.log('Cleanup complete.');
  });

  it('1. Verifies service_role key JWT claim without leaking secret', () => {
    const payload = JSON.parse(Buffer.from(serviceKey.split('.')[1], 'base64').toString('utf8'));
    assert.strictEqual(payload.role, 'service_role');
    assert.strictEqual(payload.iss, 'supabase');
  });

  it('2. Auth Admin API connectivity and Super Admin account provisioning', async () => {
    // Create admin user in auth.users
    const { data: authAdmin, error: authErr } = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { full_name: `قائد الاختبار العام ${randomSuffix}` },
    });
    assert.strictEqual(authErr, null, 'Super admin user creation must succeed');
    assert.ok(authAdmin?.user?.id);
    adminUserId = authAdmin.user.id;

    // Call register_member_profile to create profile and baseline member role
    const { data: memberNumber, error: regErr } = await adminClient.rpc('register_member_profile', {
      p_user_id: adminUserId,
      p_full_name: `قائد الاختبار العام ${randomSuffix}`,
      p_phone: '01099998888',
      p_stage_id: 'stage_3',
      p_commitment: 'committed',
    });
    assert.strictEqual(regErr, null);
    assert.ok(typeof memberNumber === 'string' && memberNumber.startsWith('SCT-2026-'));

    // Elevate role to super_admin securely
    const { error: roleErr } = await adminClient.from('user_roles').insert({
      user_id: adminUserId,
      role: 'super_admin',
    });
    assert.strictEqual(roleErr, null);

    // Sign in as Super Admin with anon client
    adminAuthClient = createClient(supabaseUrl, anonKey);
    const { data: loginData, error: loginErr } = await adminAuthClient.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    });
    assert.strictEqual(loginErr, null);
    assert.ok(loginData.session?.access_token);
    assert.strictEqual(loginData.user.id, adminUserId);

    // Verify is_super_admin() RPC returns true
    const { data: isSuper, error: isSuperErr } = await adminAuthClient.rpc('is_super_admin', {
      check_user_id: adminUserId,
    });
    assert.strictEqual(isSuperErr, null);
    assert.strictEqual(isSuper, true);
  });

  it('3. Member registration with atomic profile and QR credential issuance', async () => {
    // Create member user in auth.users
    const { data: authMember, error: authErr } = await adminClient.auth.admin.createUser({
      email: memberEmail,
      password: memberPassword,
      email_confirm: true,
      user_metadata: { full_name: `كشاف تجريبي ${randomSuffix}` },
    });
    assert.strictEqual(authErr, null);
    assert.ok(authMember?.user?.id);
    memberUserId = authMember.user.id;

    // Register profile via RPC
    const { data: memberNumber, error: regErr } = await adminClient.rpc('register_member_profile', {
      p_user_id: memberUserId,
      p_full_name: `كشاف تجريبي ${randomSuffix}`,
      p_phone: '01011112222',
      p_stage_id: 'stage_2',
      p_commitment: 'committed',
    });
    assert.strictEqual(regErr, null);
    assert.ok(typeof memberNumber === 'string' && memberNumber.startsWith('SCT-2026-'));

    // Verify profile in PostgreSQL
    const { data: profile } = await adminClient.from('profiles').select('*').eq('id', memberUserId).single();
    assert.strictEqual(profile?.full_name, `كشاف تجريبي ${randomSuffix}`);
    assert.strictEqual(profile?.stage_id, 'stage_2');
    assert.strictEqual(profile?.is_active, true);

    // Verify active QR credential
    const { data: qr } = await adminClient.from('qr_credentials').select('*').eq('member_id', memberUserId).single();
    assert.ok(qr?.id);
    assert.strictEqual(qr?.is_active, true);
    memberQrToken = qr.id;

    // Sign in as Member
    memberAuthClient = createClient(supabaseUrl, anonKey);
    const { data: loginData, error: loginErr } = await memberAuthClient.auth.signInWithPassword({
      email: memberEmail,
      password: memberPassword,
    });
    assert.strictEqual(loginErr, null);
    assert.strictEqual(loginData.user.id, memberUserId);
  });

  it('4. RLS enforcement across roles: Member is denied admin access and audit logs', async () => {
    // Member cannot query audit logs
    const { data: auditData } = await memberAuthClient.from('audit_logs').select('*');
    assert.strictEqual(auditData?.length ?? 0, 0, 'Member cannot see audit logs');

    // Member cannot grant themselves super_admin
    const { error: elevateErr } = await memberAuthClient.from('user_roles').insert({
      user_id: memberUserId,
      role: 'super_admin',
    });
    assert.ok(elevateErr, 'Member self-elevation must be blocked by RLS');

    // Super Admin CAN query audit logs
    const { data: adminAudits } = await adminAuthClient.from('audit_logs').select('*');
    assert.ok(Array.isArray(adminAudits));
  });

  it('5. QR Verification & Revocation semantics', async () => {
    // Super Admin verifies the valid member QR token
    const { data: validRes, error: validErr } = await adminAuthClient.rpc('verify_qr_credential', {
      p_token: memberQrToken,
    });
    assert.strictEqual(validErr, null);
    assert.strictEqual(validRes?.status, 'valid');
    assert.strictEqual(validRes?.member?.id, memberUserId);

    // Rotate member QR token
    const { error: rotateErr } = await adminAuthClient.rpc('rotate_qr_credential', {
      p_member_id: memberUserId,
      p_reason: 'تجديد تجريبي للاختبار',
    });
    assert.strictEqual(rotateErr, null);

    // Old QR token must now be REVOKED
    const { data: revokedRes, error: revokedErr } = await adminAuthClient.rpc('verify_qr_credential', {
      p_token: memberQrToken,
    });
    assert.strictEqual(revokedErr, null);
    assert.strictEqual(revokedRes?.status, 'revoked');

    // Retrieve the new active token
    const { data: newQr } = await adminClient.from('qr_credentials').select('*').eq('member_id', memberUserId).eq('is_active', true).single();
    assert.ok(newQr?.id);
    assert.notStrictEqual(newQr.id, memberQrToken);
    memberQrToken = newQr.id;

    // New QR token is VALID
    const { data: newValidRes } = await adminAuthClient.rpc('verify_qr_credential', {
      p_token: memberQrToken,
    });
    assert.strictEqual(newValidRes?.status, 'valid');

    // Random non-existent UUID is INVALID
    const { data: invalidRes } = await adminAuthClient.rpc('verify_qr_credential', {
      p_token: '00000000-0000-0000-0000-000000000000',
    });
    assert.strictEqual(invalidRes?.status, 'invalid');
  });

  it('6. Friday Session constraints and Cairo time attendance tracking', async () => {
    // 1. In Migration 004, chk_session_is_friday was relaxed so activities/camps can occur on other days.
    // 2. Accepts valid Friday date (2026-11-06 is Friday)
    const { data: sessionData, error: sessionErr } = await adminAuthClient
      .from('friday_sessions')
      .insert({
        session_date: '2026-11-06',
        title: `اجتماع جمعة تجريبي ${randomSuffix}`,
        start_time: '08:00:00',
        late_threshold_time: '08:30:00',
        is_open_for_attendance: true,
        created_by: adminUserId,
      })
      .select('*')
      .single();
    assert.strictEqual(sessionErr, null);
    assert.ok(sessionData?.id);
    testSessionId = sessionData.id;

    // 3. Super Admin records attendance with valid QR and uniform
    const { data: attRes, error: attErr } = await adminAuthClient.rpc('record_attendance', {
      p_session_id: testSessionId,
      p_uniform: 'with_uniform',
      p_qr_token: memberQrToken,
      p_member_id: null,
      p_manual_reason: null,
    });
    assert.strictEqual(attErr, null);
    assert.strictEqual(attRes?.success, true);
    assert.strictEqual(attRes?.member?.id, memberUserId);
    assert.ok(attRes?.arrival_status === 'on_time' || attRes?.arrival_status === 'late');

    // 4. Duplicate scan in same session is REJECTED
    const { data: dupRes } = await adminAuthClient.rpc('record_attendance', {
      p_session_id: testSessionId,
      p_uniform: 'with_uniform',
      p_qr_token: memberQrToken,
      p_member_id: null,
      p_manual_reason: null,
    });
    assert.strictEqual(dupRes?.success, false);
    assert.strictEqual(dupRes?.code, 'DUPLICATE');

    // 5. Verify TIMESTAMPTZ and attendance record in database
    const { data: recordRow } = await adminAuthClient
      .from('attendance_records')
      .select('*')
      .eq('session_id', testSessionId)
      .eq('member_id', memberUserId)
      .single();
    assert.ok(recordRow?.recorded_at);
    assert.strictEqual(recordRow?.uniform_status, 'with_uniform');
    assert.strictEqual(recordRow?.recorded_by, adminUserId);
  });

  it('7. Team distribution: Draft isolation and atomic publishing with advisory lock', async () => {
    // 1. Super Admin saves team draft
    const { data: distId, error: draftErr } = await adminAuthClient.rpc('save_team_distribution_draft', {
      p_title: `توزيع اختبار ${randomSuffix}`,
      p_mode: 'mixed_stages',
      p_seed: `seed-${randomSuffix}`,
      p_teams: [
        {
          name: `طليعة الفهد ${randomSuffix}`,
          stage_id: null,
          color_hex: '#173C32',
          icon_name: 'flame',
          leader_id: memberUserId,
          member_ids: [memberUserId],
        },
      ],
    });
    assert.strictEqual(draftErr, null);
    assert.ok(distId);
    testDistributionId = distId;

    // 2. Member CANNOT see the draft distribution
    const { data: memberDists } = await memberAuthClient.from('team_distributions').select('*').eq('id', testDistributionId);
    assert.strictEqual(memberDists?.length ?? 0, 0, 'Draft distributions must be invisible to regular members');

    // 3. Member has no published team yet
    const { data: myTeamBefore } = await memberAuthClient.rpc('get_my_published_team');
    assert.strictEqual(myTeamBefore, null);

    // 4. Super Admin publishes the distribution
    const { error: pubErr } = await adminAuthClient.rpc('publish_team_distribution', {
      p_distribution_id: testDistributionId,
    });
    assert.strictEqual(pubErr, null);

    // 5. Member CAN now see their published team
    const { data: myTeamAfter, error: myTeamErr } = await memberAuthClient.rpc('get_my_published_team');
    assert.strictEqual(myTeamErr, null);
    assert.ok(myTeamAfter);
    assert.strictEqual(myTeamAfter?.team?.name, `طليعة الفهد ${randomSuffix}`);
    assert.strictEqual(myTeamAfter?.members?.length, 1);
    assert.strictEqual(myTeamAfter?.members[0]?.id, memberUserId);
  });
});
