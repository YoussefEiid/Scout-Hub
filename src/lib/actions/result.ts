/**
 * Server-action result contract.
 *
 * Next.js masks messages of errors thrown out of Server Actions in production builds, so actions
 * return a discriminated result instead. Expected failures (auth, validation, configuration) are
 * AppError; anything else is logged WITHOUT payload details and reported as INTERNAL.
 */
export type ActionErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'CONFIG_MISSING'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ActionErrorCode; message: string };

export class AppError extends Error {
  constructor(public readonly code: ActionErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof AppError) {
      return { ok: false, code: err.code, message: err.message };
    }
    // Never log request payloads, tokens or full error objects that may embed them.
    console.error('[scout-action] unexpected failure:', err instanceof Error ? err.name : typeof err);
    return { ok: false, code: 'INTERNAL', message: 'حدث خطأ غير متوقع، يرجى المحاولة لاحقًا.' };
  }
}

/** Maps a PostgreSQL / PostgREST error from our RPC functions to a safe AppError. */
export function mapDbError(error: { message?: string; code?: string } | null | undefined): AppError {
  const msg = error?.message ?? '';
  if (error?.code === '42501' || msg.includes('FORBIDDEN')) {
    return new AppError('FORBIDDEN', 'ليس لديك الصلاحية للقيام بهذه العملية.');
  }
  if (msg.includes('NOT_DRAFT')) return new AppError('CONFLICT', 'لا يمكن تعديل توزيع تم نشره، أنشئ مسودة جديدة.');
  if (msg.includes('STAGE_MISMATCH')) return new AppError('VALIDATION', 'لا يمكن نقل كشاف إلى فريق من مرحلة أخرى في نمط المراحل المنفصلة.');
  if (msg.includes('DUPLICATE_MEMBER')) return new AppError('VALIDATION', 'يوجد كشاف مكرر داخل التوزيع.');
  if (msg.includes('INVALID_MEMBER')) return new AppError('VALIDATION', 'التوزيع يحتوي على عضو غير موجود أو غير نشط.');
  if (msg.includes('INVALID_SECTION')) return new AppError('VALIDATION', 'القسم الكشفي المحدد غير صالح أو غير نشط.');
  if (msg.includes('INVALID_YEAR')) return new AppError('VALIDATION', 'السنة الكشفية المحددة لا تنتمي لهذا القسم أو غير نشطة.');
  if (msg.includes('DISTRIBUTION_NOT_FOUND')) return new AppError('NOT_FOUND', 'التوزيع المطلوب غير موجود.');
  if (msg.includes('EMPTY_DISTRIBUTION') || msg.includes('NO_TEAMS')) return new AppError('VALIDATION', 'لا يمكن نشر توزيع بلا فرق.');
  if (msg.includes('MEMBER_NOT_FOUND') || msg.includes('NO_ACTIVE_PROFILE')) return new AppError('NOT_FOUND', 'لم يتم العثور على ملف الكشاف.');
  if (error?.code === '23505') return new AppError('CONFLICT', 'السجل موجود بالفعل.');
  console.error('[scout-db] unmapped database error code:', error?.code ?? 'unknown');
  return new AppError('INTERNAL', 'حدث خطأ في قاعدة البيانات، يرجى المحاولة لاحقًا.');
}
