import { Profile, FridaySession, AchievementDefinition, ScoutStageId, CommitmentPreference } from '../../types';

export const DEMO_STAGES = [
  { id: 'stage_1' as ScoutStageId, name_ar: 'المرحلة الأولى (الأشبال)', code: 'cubs' as const, min_age: 7, max_age: 11 },
  { id: 'stage_2' as ScoutStageId, name_ar: 'المرحلة الثانية (الفتيان)', code: 'scouts' as const, min_age: 12, max_age: 14 },
  { id: 'stage_3' as ScoutStageId, name_ar: 'المرحلة الثالثة (المتقدم)', code: 'advanced' as const, min_age: 15, max_age: 17 },
];

export const DEMO_ACHIEVEMENTS: AchievementDefinition[] = [
  { id: 'first_attendance', name_ar: 'أول حضور', description_ar: 'حضور أول اجتماع كشفي بنجاح', icon_name: 'compass', badge_color: '#23836B', points: 15 },
  { id: 'three_streak', name_ar: '٣ جمع متتالية', description_ar: 'حضور ثلاثة اجتماعات متتالية دون انقطاع', icon_name: 'flame', badge_color: '#E89B50', points: 30 },
  { id: 'uniform_champion', name_ar: 'ملتزم بالزي', description_ar: 'حضور بالزي الكشفي الكامل باستمرار', icon_name: 'shirt', badge_color: '#173C32', points: 25 },
  { id: 'early_bird', name_ar: 'الحضور المبكر', description_ar: 'الوصول قبل موعد الاجتماع بنشاط', icon_name: 'clock', badge_color: '#3B82F6', points: 20 },
  { id: 'active_scout', name_ar: 'عضو نشيط ومميز', description_ar: 'مشاركة وتفاعل إيجابي استثنائي', icon_name: 'award', badge_color: '#F59E0B', points: 40 },
];

// 60 Realistic Arabic Scout Members
const ARABIC_FIRST_NAMES = [
  'أحمد', 'محمد', 'يوسف', 'عمر', 'علي', 'إبراهيم', 'حسن', 'حسين', 'خالد', 'زياد',
  'طارق', 'حمزة', 'مروان', 'سيف', 'كريم', 'ياسين', 'آدم', 'مازن', 'بلال', 'مصطفى'
];

const ARABIC_LAST_NAMES = [
  'السيد', 'محمود', 'الشريف', 'إسماعيل', 'النجار', 'فاروق', 'منصور', 'الباز', 'شوقي', 'عفيفي',
  'الصاوي', 'الجندي', 'القاضي', 'سليمان', 'رضوان', 'عثمان', 'غنيم', 'زهران', 'الحداد', 'سعيد'
];

export function generate60RealisticScouts(): {
  members: Profile[];
  qrCredentials: Record<string, string>; // memberId -> qrTokenUUID
} {
  const members: Profile[] = [];
  const qrCredentials: Record<string, string> = {};

  const stages: ScoutStageId[] = ['stage_1', 'stage_2', 'stage_3'];
  const commitments: CommitmentPreference[] = ['committed', 'committed', 'committed', 'circumstances', 'inactive'];

  for (let i = 1; i <= 60; i++) {
    const firstName = ARABIC_FIRST_NAMES[(i - 1) % ARABIC_FIRST_NAMES.length];
    const lastName = ARABIC_LAST_NAMES[Math.floor((i - 1) / 3) % ARABIC_LAST_NAMES.length];
    const memberId = `scout-uuid-${i.toString().padStart(3, '0')}`;
    const tokenUuid = `qr-tok-${(1000 + i).toString()}-4b91-8c42-${(90000 + i).toString()}`;
    
    // Balanced stages: 20 in stage_1, 20 in stage_2, 20 in stage_3
    const stageId = stages[Math.floor((i - 1) / 20)];
    const commitment = commitments[i % commitments.length];

    members.push({
      id: memberId,
      member_number: `SCT-2026-${i.toString().padStart(4, '0')}`,
      full_name: `${firstName} ${lastName}`,
      phone: `010${(10000000 + i * 1111).toString().substring(0, 8)}`,
      stage_id: stageId,
      initial_commitment: commitment,
      is_active: i !== 58, // member 58 is inactive
      created_at: new Date(Date.now() - (60 - i) * 86400000 * 2).toISOString(),
      updated_at: new Date().toISOString(),
      roles: i === 1 ? ['super_admin'] : i <= 3 ? ['admin'] : i <= 6 ? ['attendance_leader'] : ['member'],
    });

    qrCredentials[memberId] = tokenUuid;
  }

  return { members, qrCredentials };
}

// Sample Friday meetings in Cairo timezone
export const DEMO_FRIDAY_SESSIONS: FridaySession[] = [
  {
    id: 'session-2026-11-06',
    session_date: '2026-11-06',
    title: 'اجتماع الجمعة — افتتاح مخيم الربيع وتدريب الملاحة الكشفية',
    start_time: '08:30:00',
    late_threshold_time: '08:45:00',
    is_open_for_attendance: true,
    response_deadline: '2026-11-05T22:00:00.000Z',
    notes: 'يرجى إحضار الحبال الكشفية والدفتر، والالتزام بالزي الكامل والمنديل.',
    created_at: '2026-11-01T10:00:00.000Z',
    stats: {
      attending_count: 48,
      absent_count: 5,
      circumstances_count: 7,
      actual_attendance_count: 42,
      uniform_count: 38,
    },
  },
  {
    id: 'session-2026-10-30',
    session_date: '2026-10-30',
    title: 'اجتماع الجمعة — تدريب الإسعافات الأولية والشفرات الكشفية',
    start_time: '08:30:00',
    late_threshold_time: '08:45:00',
    is_open_for_attendance: false,
    notes: 'تم تكريم الفائزين بمسابقة العقد والربطات.',
    created_at: '2026-10-25T10:00:00.000Z',
    stats: {
      attending_count: 50,
      absent_count: 4,
      circumstances_count: 6,
      actual_attendance_count: 47,
      uniform_count: 44,
    },
  },
];
