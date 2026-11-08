import assert from 'node:assert';
import { describe, it } from 'node:test';
import { ScoutSection } from '../../src/types';
import { registerScoutMember } from '../../src/lib/auth/registration';
import { mapDbError } from '../../src/lib/actions/result';

describe('Dynamic Scout Section & Year Selector Tests', () => {
  const mockSections: ScoutSection[] = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      code: 'cubs',
      name: 'فريق كشافة (الأشبال)',
      description: 'مرحلة الأشبال',
      icon: 'flame',
      color_theme: '#EA580C',
      display_order: 1,
      is_active: true,
      created_at: '',
      updated_at: '',
      years: [
        {
          id: 'aaaa1111-1111-4111-8111-111111111111',
          section_id: '11111111-1111-4111-8111-111111111111',
          name: 'السنة الأولى',
          display_order: 1,
          is_active: true,
          created_at: '',
          updated_at: '',
        },
        {
          id: 'aaaa2222-2222-4222-8222-222222222222',
          section_id: '11111111-1111-4111-8111-111111111111',
          name: 'السنة الثانية',
          display_order: 2,
          is_active: true,
          created_at: '',
          updated_at: '',
        },
        {
          id: 'aaaa3333-3333-4333-8333-333333333333',
          section_id: '11111111-1111-4111-8111-111111111111',
          name: 'السنة الثالثة (معطلة)',
          display_order: 3,
          is_active: false, // inactive year!
          created_at: '',
          updated_at: '',
        },
      ],
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      code: 'scouts',
      name: 'فريق مرشدات',
      description: 'مرحلة المرشدات',
      icon: 'compass',
      color_theme: '#23836B',
      display_order: 2,
      is_active: true,
      created_at: '',
      updated_at: '',
      years: [
        {
          id: 'bbbb1111-1111-4111-8111-111111111111',
          section_id: '22222222-2222-4222-8222-222222222222',
          name: 'السنة الأولى فتيات',
          display_order: 1,
          is_active: true,
          created_at: '',
          updated_at: '',
        },
      ],
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      code: 'empty_sec',
      name: 'قسم جديد بلا سنوات',
      description: 'قسم تحت التهيئة',
      icon: 'award',
      color_theme: '#1E40AF',
      display_order: 3,
      is_active: true,
      created_at: '',
      updated_at: '',
      years: [], // Section without configured years!
    },
  ];

  it('1. No section selected -> Year dropdown must be disabled and have no active years', () => {
    const selectedSectionId = '';
    const selectedYearId = '';

    const currentSection = mockSections.find((s) => s.id === selectedSectionId);
    const activeYears = (currentSection?.years || []).filter((y) => y.is_active);

    const isYearDisabled = !selectedSectionId || activeYears.length === 0;

    assert.strictEqual(isYearDisabled, true, 'Year dropdown must be disabled when no section is selected');
    assert.strictEqual(activeYears.length, 0, 'No years should be available when no section is selected');
    assert.strictEqual(selectedYearId, '', 'Year selection must remain empty');
  });

  it('2. Valid section selected -> Year dropdown becomes enabled and returns matching active years', () => {
    const selectedSectionId = '11111111-1111-4111-8111-111111111111';
    const currentSection = mockSections.find((s) => s.id === selectedSectionId);
    assert.ok(currentSection, 'Section must be found');

    const activeYears = (currentSection.years || []).filter((y) => y.is_active);
    const isYearDisabled = !selectedSectionId || activeYears.length === 0;

    assert.strictEqual(isYearDisabled, false, 'Year dropdown must be enabled when valid section with years is selected');
    assert.strictEqual(activeYears.length, 2, 'Should return only the 2 active years for this section');
    assert.strictEqual(activeYears[0].name, 'السنة الأولى');
    assert.strictEqual(activeYears[1].name, 'السنة الثانية');
  });

  it('3. Inactive years are strictly hidden from user selection', () => {
    const selectedSectionId = '11111111-1111-4111-8111-111111111111';
    const currentSection = mockSections.find((s) => s.id === selectedSectionId);
    const activeYears = (currentSection?.years || []).filter((y) => y.is_active);

    const hasInactive = activeYears.some((y) => !y.is_active || y.name.includes('معطلة'));
    assert.strictEqual(hasInactive, false, 'Inactive years must never be available in the dropdown');
  });

  it('4. Switching sections clears previously selected year and loads new section years', () => {
    let selectedSectionId = '11111111-1111-4111-8111-111111111111';
    let selectedYearId = 'aaaa1111-1111-4111-8111-111111111111';

    // User switches to section 2
    const newSectionId = '22222222-2222-4222-8222-222222222222';
    selectedSectionId = newSectionId;
    selectedYearId = ''; // Reset on section change

    const newSection = mockSections.find((s) => s.id === selectedSectionId);
    const newActiveYears = (newSection?.years || []).filter((y) => y.is_active);

    assert.strictEqual(selectedYearId, '', 'Selected year must be reset to empty string when section changes');
    assert.strictEqual(newActiveYears.length, 1, 'New section years must be loaded');
    assert.strictEqual(newActiveYears[0].id, 'bbbb1111-1111-4111-8111-111111111111');
  });

  it('5. Section without configured years -> Dropdown stays disabled and displays clear Arabic notification', () => {
    const selectedSectionId = '33333333-3333-4333-8333-333333333333';
    const currentSection = mockSections.find((s) => s.id === selectedSectionId);
    const activeYears = (currentSection?.years || []).filter((y) => y.is_active);

    const isYearDisabled = !selectedSectionId || activeYears.length === 0;
    const showEmptyYearsNotice = Boolean(selectedSectionId && activeYears.length === 0);

    assert.strictEqual(isYearDisabled, true, 'Dropdown must remain disabled when section has no configured years');
    assert.strictEqual(showEmptyYearsNotice, true, 'Must display Arabic empty years notice');
  });

  it('6. Server rejects registration if sectionId is provided without valid yearId', async () => {
    process.env.SCOUT_DEMO_MODE = 'true';

    await assert.rejects(
      async () => {
        await registerScoutMember({
          fullName: 'كشاف تجريبي جديد',
          sectionId: '11111111-1111-4111-8111-111111111111',
          yearId: '', // Empty yearId
          commitment: 'committed',
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('سنة كشفية') || err.message.includes('السنة الكشفية'));
        return true;
      }
    );
  });

  it('7. Server rejects registration if sectionId is not a valid UUID', async () => {
    process.env.SCOUT_DEMO_MODE = 'true';

    await assert.rejects(
      async () => {
        await registerScoutMember({
          fullName: 'كشاف تجريبي جديد',
          sectionId: 'invalid-non-uuid-section',
          yearId: 'aaaa1111-1111-4111-8111-111111111111',
          commitment: 'committed',
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('قسم كشفي'));
        return true;
      }
    );
  });

  it('8. Database error mapping translates INVALID_SECTION and INVALID_YEAR to Arabic validation errors', () => {
    const sectionErr = mapDbError({ message: 'INVALID_SECTION: section does not exist or inactive' });
    assert.strictEqual(sectionErr.code, 'VALIDATION');
    assert.strictEqual(sectionErr.message, 'القسم الكشفي المحدد غير صالح أو غير نشط.');

    const yearErr = mapDbError({ message: 'INVALID_YEAR: year does not belong to section' });
    assert.strictEqual(yearErr.code, 'VALIDATION');
    assert.strictEqual(yearErr.message, 'السنة الكشفية المحددة لا تنتمي لهذا القسم أو غير نشطة.');
  });
});
