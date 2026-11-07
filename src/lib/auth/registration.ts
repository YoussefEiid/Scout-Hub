import { AppError, mapDbError } from '@/lib/actions/result';
import { CONFIG_MISSING_MESSAGE, getBackendMode } from '@/lib/config/runtime';
import { ScoutStore } from '@/lib/data/scout-store';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CommitmentPreference, ScoutStageId } from '@/types';

export interface RegisterInput {
  fullName: string;
  stageId?: ScoutStageId;
  sectionId?: string;
  yearId?: string;
  commitment: CommitmentPreference;
  phone?: string;
  email?: string;
  password?: string;
}

export interface RegisterOutput {
  id: string;
  member_number: string;
  full_name: string;
  stage_id: ScoutStageId;
  section_id?: string | null;
  year_id?: string | null;
  initial_commitment: CommitmentPreference;
  is_active: boolean;
  created_at: string;
}

/**
 * Public registration flow.
 *
 * In Supabase mode:
 * 1. Creates an auth user with the service role client.
 * 2. Calls the SECURITY DEFINER RPC `register_member_profile_v2` (or legacy `register_member_profile`),
 *    which creates the profile, assigns the 'member' role, and seeds a QR credential in a single database transaction.
 * 3. If step 2 fails for any reason, the auth user is immediately deleted (compensating action)
 *    so no orphaned auth records remain in the system.
 *
 * In Demo mode (local dev / tests only):
 * Delegates directly to ScoutStore in-memory registration.
 */
export async function registerScoutMember(input: RegisterInput): Promise<RegisterOutput> {
  const trimmedName = input.fullName?.trim() ?? '';
  if (trimmedName.length < 3) {
    throw new AppError('VALIDATION', 'الاسم الكامل يجب أن يتكون من 3 أحرف على الأقل');
  }
  if (trimmedName.length > 100) {
    throw new AppError('VALIDATION', 'الاسم الكامل يجب ألا يتجاوز 100 حرف.');
  }

  const validCommitments: CommitmentPreference[] = ['committed', 'inactive', 'circumstances'];
  if (!validCommitments.includes(input.commitment)) {
    throw new AppError('VALIDATION', 'درجة الالتزام المحددة غير صالحة.');
  }

  // Validate either dynamic section+year or legacy stageId
  const isValidUUID = (val?: string | null) =>
    Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

  const hasDynamicScope = Boolean(
    input.sectionId && input.yearId && isValidUUID(input.sectionId) && isValidUUID(input.yearId)
  );
  const stageId = input.stageId || 'stage_1';

  if (!hasDynamicScope && !input.stageId && !input.sectionId) {
    throw new AppError('VALIDATION', 'يجب اختيار القسم الكشفي والسنة الدراسية.');
  }

  const mode = getBackendMode();

  if (mode === 'misconfigured') {
    throw new AppError('CONFIG_MISSING', CONFIG_MISSING_MESSAGE);
  }

  if (mode === 'demo') {
    const demoProfile = ScoutStore.registerNewMember({
      fullName: trimmedName,
      stageId,
      commitment: input.commitment,
      phone: input.phone,
    });
    return {
      id: demoProfile.id,
      member_number: demoProfile.member_number,
      full_name: demoProfile.full_name,
      stage_id: demoProfile.stage_id,
      section_id: input.sectionId ?? null,
      year_id: input.yearId ?? null,
      initial_commitment: demoProfile.initial_commitment,
      is_active: demoProfile.is_active,
      created_at: demoProfile.created_at,
    };
  }

  // Supabase Mode
  if (!input.email || !input.password) {
    throw new AppError('VALIDATION', 'البريد الإلكتروني وكلمة المرور مطلوبان لإنشاء الحساب.');
  }

  if (input.password.length < 6) {
    throw new AppError('VALIDATION', 'كلمة المرور يجب أن تتكون من 6 أحرف على الأقل.');
  }

  const adminClient = createAdminClient();

  // 1. Create auth user
  const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: trimmedName },
  });

  if (authErr || !authUser?.user) {
    const msg = authErr?.message ?? '';
    if (msg.includes('already registered') || msg.includes('unique')) {
      throw new AppError('CONFLICT', 'البريد الإلكتروني مسجل بالفعل لمستخدم آخر.');
    }
    console.error('[registration] failed to create auth user:', authErr?.code ?? 'unknown');
    throw new AppError('INTERNAL', 'تعذر إنشاء الحساب الأمني، يرجى المحاولة لاحقًا.');
  }

  const userId = authUser.user.id;

  // 2. Call transactional registration RPC
  try {
    let memberNumber: string;

    if (hasDynamicScope) {
      const { data, error: rpcErr } = await adminClient.rpc('register_member_profile_v2', {
        p_user_id: userId,
        p_full_name: trimmedName,
        p_phone: input.phone?.trim() || null,
        p_section_id: input.sectionId,
        p_year_id: input.yearId,
        p_commitment: input.commitment,
      });
      if (rpcErr) throw mapDbError(rpcErr);
      memberNumber = data as string;
    } else {
      const { data, error: rpcErr } = await adminClient.rpc('register_member_profile', {
        p_user_id: userId,
        p_full_name: trimmedName,
        p_phone: input.phone?.trim() || null,
        p_stage_id: stageId,
        p_commitment: input.commitment,
      });
      if (rpcErr) throw mapDbError(rpcErr);
      memberNumber = data as string;
    }

    return {
      id: userId,
      member_number: memberNumber,
      full_name: trimmedName,
      stage_id: stageId,
      section_id: input.sectionId ?? null,
      year_id: input.yearId ?? null,
      initial_commitment: input.commitment,
      is_active: true,
      created_at: new Date().toISOString(),
    };
  } catch (err) {
    // 3. Compensation: remove the created auth user
    try {
      await adminClient.auth.admin.deleteUser(userId);
    } catch (compErr) {
      console.error('[registration] failed to compensate deleted user:', compErr);
    }
    throw err;
  }
}
