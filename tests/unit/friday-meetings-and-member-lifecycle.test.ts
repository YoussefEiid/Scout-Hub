process.env.SCOUT_DEMO_MODE = 'true';

import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  createFridayMeetingAction,
  updateFridayMeetingAction,
  toggleMeetingAttendanceAction,
  deleteFridayMeetingAction,
  deleteAttendanceRecordAction,
  updateAttendanceUniformAction,
  getFridayMeetingsAdminAction,
  getLeaderScannerDataAction,
  toggleMemberActiveAction,
  deleteMemberPermanentAction,
  recordAttendanceAction,
} from '@/app/actions/scout-actions';
import { ScoutStore } from '@/lib/data/scout-store';

describe('Friday Meetings & Member Lifecycle Server Actions Unit Tests', () => {
  it('1. Creates a new Friday meeting with validation and default timing', async () => {
    // Rejects too-short title
    await assert.rejects(
      async () => {
        await createFridayMeetingAction({
          title: 'a',
          session_date: '2026-11-20',
        });
      },
      (err: any) => err.code === 'VALIDATION'
    );

    // Creates valid meeting
    const res = await createFridayMeetingAction({
      title: 'اجتماع جمعة كشفي تجريبي',
      session_date: '2026-11-20',
      start_time: '08:30:00',
      late_threshold_time: '08:45:00',
      is_open_for_attendance: false,
      notes: 'توجيهات الاجتماع التجريبي',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.session.title, 'اجتماع جمعة كشفي تجريبي');
    assert.strictEqual(res.session.is_open_for_attendance, false);
    assert.strictEqual(res.session.status, 'scheduled');
  });

  it('2. Toggles meeting attendance open and closed cleanly', async () => {
    const res = await createFridayMeetingAction({
      title: 'اجتماع مفتوح للحضور',
      session_date: '2026-11-27',
      is_open_for_attendance: false,
    });

    // Open attendance
    const openRes = await toggleMeetingAttendanceAction(res.session.id, true);
    assert.strictEqual(openRes.success, true);

    const checkOpen = ScoutStore.getFridaySessions().find((s) => s.id === res.session.id);
    assert.strictEqual(checkOpen?.is_open_for_attendance, true);
    assert.strictEqual(checkOpen?.status, 'open');

    // Close attendance
    const closeRes = await toggleMeetingAttendanceAction(res.session.id, false);
    assert.strictEqual(closeRes.success, true);

    const checkClosed = ScoutStore.getFridaySessions().find((s) => s.id === res.session.id);
    assert.strictEqual(checkClosed?.is_open_for_attendance, false);
    assert.strictEqual(checkClosed?.status, 'closed');
  });

  it('3. Updates meeting details, times, and notes', async () => {
    const res = await createFridayMeetingAction({
      title: 'اجتماع قبل التعديل',
      session_date: '2026-12-04',
    });

    const updated = await updateFridayMeetingAction(res.session.id, {
      title: 'اجتماع بعد التعديل الرسمي',
      start_time: '09:00:00',
      notes: 'تم تأخير موعد الطابور 30 دقيقة',
    });

    assert.strictEqual(updated.success, true);
    assert.strictEqual(updated.session?.title, 'اجتماع بعد التعديل الرسمي');
    assert.strictEqual(updated.session?.start_time, '09:00:00');
    assert.strictEqual(updated.session?.notes, 'تم تأخير موعد الطابور 30 دقيقة');
  });

  it('4. Deletes a Friday meeting cleanly from the store', async () => {
    const res = await createFridayMeetingAction({
      title: 'اجتماع للحذف',
      session_date: '2026-12-11',
    });

    const delRes = await deleteFridayMeetingAction(res.session.id);
    assert.strictEqual(delRes.success, true);

    const remaining = ScoutStore.getFridaySessions().find((s) => s.id === res.session.id);
    assert.strictEqual(remaining, undefined);
  });

  it('5. Records attendance, updates uniform status, and allows deletion of record', async () => {
    const sessRes = await createFridayMeetingAction({
      title: 'اجتماع اختبار الحضور والزي',
      session_date: '2026-12-18',
      is_open_for_attendance: true,
    });

    const members = ScoutStore.getAllMembers();
    const testMember = members[0];

    // Record attendance
    const attRes = await recordAttendanceAction({
      sessionId: sessRes.session.id,
      memberId: testMember.id,
      uniformStatus: 'with_uniform',
    });
    assert.strictEqual(attRes.success, true);
    assert.ok(attRes.record?.id);

    // Update uniform status
    const uniformRes = await updateAttendanceUniformAction(attRes.record!.id, 'without_uniform');
    assert.strictEqual(uniformRes.success, true);

    const records = ScoutStore.getAttendanceRecords(sessRes.session.id);
    const updatedRec = records.find((r) => r.id === attRes.record!.id);
    assert.strictEqual(updatedRec?.uniform_status, 'without_uniform');

    // Delete attendance record
    const delRecordRes = await deleteAttendanceRecordAction(attRes.record!.id, 'خطأ في المسح');
    assert.strictEqual(delRecordRes.success, true);

    const checkRecords = ScoutStore.getAttendanceRecords(sessRes.session.id);
    assert.strictEqual(checkRecords.find((r) => r.id === attRes.record!.id), undefined);
  });

  it('6. Leader scanner data returns active session, open sessions, and permissions', async () => {
    const sessRes = await createFridayMeetingAction({
      title: 'اجتماع الماسح',
      session_date: '2026-12-25',
      is_open_for_attendance: true,
    });

    const scannerData = await getLeaderScannerDataAction(undefined, sessRes.session.id);
    assert.strictEqual(scannerData.activeSession?.id, sessRes.session.id);
    assert.ok(Array.isArray(scannerData.allMembers));
    assert.strictEqual(typeof scannerData.attendanceCount, 'number');
    assert.strictEqual(scannerData.isSuperAdmin, true);
  });

  it('7. Member deactivation and reactivation updates member active status', async () => {
    const members = ScoutStore.getAllMembers();
    const targetMember = members[1]; // non-current user

    // Deactivate member
    const deactRes = await toggleMemberActiveAction(targetMember.id, false);
    assert.strictEqual(deactRes.success, true);
    assert.strictEqual(deactRes.isActive, false);

    const checkMember = ScoutStore.getMemberById(targetMember.id);
    assert.strictEqual(checkMember?.is_active, false);

    // Reactivate member
    const reactRes = await toggleMemberActiveAction(targetMember.id, true);
    assert.strictEqual(reactRes.success, true);
    assert.strictEqual(reactRes.isActive, true);

    const checkMember2 = ScoutStore.getMemberById(targetMember.id);
    assert.strictEqual(checkMember2?.is_active, true);
  });

  it('8. Permanent member deletion removes member safely from the system', async () => {
    // Add a dummy member for deletion test
    const dummy = ScoutStore.registerNewMember({
      fullName: 'كشاف تجريبي للحذف',
      stageId: 'stage_1',
      commitment: 'committed',
    });

    const delRes = await deleteMemberPermanentAction(dummy.id);
    assert.strictEqual(delRes.success, true);
    assert.strictEqual(delRes.deletedMemberId, dummy.id);

    const check = ScoutStore.getMemberById(dummy.id);
    assert.strictEqual(check, null);
  });
});
