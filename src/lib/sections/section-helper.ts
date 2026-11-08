import { Profile, ScoutSection, ScoutSectionYear } from '@/types';

const LEGACY_STAGE_NAMES: Record<string, string> = {
  stage_1: 'المرحلة الأولى (الأشبال)',
  stage_2: 'المرحلة الثانية (الفتيان)',
  stage_3: 'المرحلة الثالثة (المتقدم)',
  cubs: 'الأشبال',
  scouts: 'الفتيان',
  advanced: 'المتقدم',
};

/**
 * Returns the human-readable dynamic section name for a member.
 * Prioritizes profile.section.name, then falls back to legacy stage name,
 * and if neither is present returns the official fallback:
 * "لم يتم تحديد القسم أو السنة الكشفية بعد"
 */
export function getSectionDisplayName(
  profile?: Partial<Profile> | null,
  fallbackText = 'لم يتم تحديد القسم أو السنة الكشفية بعد'
): string {
  if (!profile) return fallbackText;

  if (profile.section?.name && profile.section.name.trim().length > 0) {
    return profile.section.name.trim();
  }

  if (profile.stage_id && LEGACY_STAGE_NAMES[profile.stage_id]) {
    return LEGACY_STAGE_NAMES[profile.stage_id];
  }

  return fallbackText;
}

/**
 * Returns the dynamic section year name for a member (e.g., "سنة ثانية").
 */
export function getSectionYearDisplayName(
  profile?: Partial<Profile> | null
): string | null {
  if (!profile?.year?.name) return null;
  return profile.year.name.trim();
}

/**
 * Returns the full formatted scout scope (e.g. "فريق كشافة — سنة ثانية")
 * or fallback if unassigned.
 */
export function getFullScoutScopeDisplay(
  profile?: Partial<Profile> | null,
  fallbackText = 'لم يتم تحديد القسم أو السنة الكشفية بعد'
): string {
  if (!profile) return fallbackText;

  const sectionName = profile.section?.name?.trim();
  const yearName = profile.year?.name?.trim();

  if (sectionName && yearName) {
    return `${sectionName} — ${yearName}`;
  }

  if (sectionName) {
    return sectionName;
  }

  if (profile.stage_id && LEGACY_STAGE_NAMES[profile.stage_id]) {
    return LEGACY_STAGE_NAMES[profile.stage_id];
  }

  return fallbackText;
}
