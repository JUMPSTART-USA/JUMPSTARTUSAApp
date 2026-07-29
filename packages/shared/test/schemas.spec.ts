import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  ROLE_KEYS,
  ROLE_PERMISSIONS,
  campaignSchema,
  caseNoteSchema,
  donationSchema,
  employmentSchema,
  housingEnrollmentSchema,
  insideClassSchema,
  insideEnrollmentSchema,
  outsideEnrollmentSchema,
  permissionsForRole,
  vehicleSchema,
} from '../src';

const uuid = '4c9f3a2e-8f1d-4f6a-9c3b-2d1e5f7a8b9c';
const uuid2 = '5d0f4b3f-9a2e-5b7b-ad4c-3e2f6a8b9c0d';

describe('enrollment business rules (requirements: left early / completion assessment)', () => {
  const base = {
    participantProfileId: uuid,
    insideClassId: uuid2,
    enrollmentDate: '2026-01-10',
  };

  it('rejects left_early without date and reason', () => {
    const result = insideEnrollmentSchema.safeParse({ ...base, status: 'left_early' });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('leftEarlyDate');
    expect(paths).toContain('leftEarlyReason');
  });

  it('accepts left_early with date and reason', () => {
    const result = insideEnrollmentSchema.safeParse({
      ...base,
      status: 'left_early',
      leftEarlyDate: '2026-02-01',
      leftEarlyReason: 'Transferred to another facility',
    });
    expect(result.success).toBe(true);
  });

  it('rejects completed without a Blue/Green/Yellow/Red assessment', () => {
    const result = insideEnrollmentSchema.safeParse({
      ...base,
      status: 'completed',
      completionDate: '2026-03-01',
    });
    expect(result.success).toBe(false);
  });

  it('allows assessment_pending as the interim completed state', () => {
    const result = insideEnrollmentSchema.safeParse({
      ...base,
      status: 'assessment_pending',
      completionDate: '2026-03-01',
    });
    expect(result.success).toBe(true);
  });

  it('rejects completion date before enrollment date', () => {
    const result = insideEnrollmentSchema.safeParse({
      ...base,
      status: 'completed',
      finalAssessment: 'green',
      completionDate: '2025-12-01',
    });
    expect(result.success).toBe(false);
  });

  it('outside enrollments use completionAssessment with the same rules', () => {
    const result = outsideEnrollmentSchema.safeParse({
      participantProfileId: uuid,
      outsideProgramId: uuid2,
      enrollmentDate: '2026-01-10',
      status: 'completed',
    });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('completionAssessment');
  });
});

describe('housing business rules (§6.4)', () => {
  const base = { participantProfileId: uuid, homeId: uuid2, moveInDate: '2026-01-05' };

  it('rejects moved-out statuses without move-out date and reason', () => {
    for (const status of ['completed', 'left_early', 'removed', 'transferred'] as const) {
      const result = housingEnrollmentSchema.safeParse({ ...base, status });
      expect(result.success, `status=${status} should require move-out fields`).toBe(false);
    }
  });

  it('rejects completed without a completion assessment', () => {
    const result = housingEnrollmentSchema.safeParse({
      ...base,
      status: 'completed',
      moveOutDate: '2026-04-01',
      reasonForLeaving: 'Program completed',
    });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('completionAssessment');
  });

  it('rejects move-out before move-in', () => {
    const result = housingEnrollmentSchema.safeParse({
      ...base,
      status: 'left_early',
      moveOutDate: '2025-12-01',
      reasonForLeaving: 'Relapse',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid completed exit', () => {
    const result = housingEnrollmentSchema.safeParse({
      ...base,
      status: 'completed',
      moveOutDate: '2026-04-01',
      reasonForLeaving: 'Program completed',
      completionAssessment: 'blue',
    });
    expect(result.success).toBe(true);
  });
});

describe('misc validation rules from the requirements', () => {
  it('donation amount must be positive', () => {
    expect(
      donationSchema.safeParse({ donorId: uuid, donationDate: '2026-01-01', amount: -5 }).success,
    ).toBe(false);
    expect(
      donationSchema.safeParse({ donorId: uuid, donationDate: '2026-01-01', amount: 50 }).success,
    ).toBe(true);
  });

  it('vehicle year must be plausible', () => {
    const base = { make: 'Ford', model: 'Transit' };
    expect(vehicleSchema.safeParse({ ...base, year: 1900 }).success).toBe(false);
    expect(vehicleSchema.safeParse({ ...base, year: new Date().getFullYear() + 5 }).success).toBe(
      false,
    );
    expect(vehicleSchema.safeParse({ ...base, year: 2020 }).success).toBe(true);
  });

  it('class end date cannot precede start date', () => {
    expect(
      insideClassSchema.safeParse({
        institutionId: uuid,
        name: 'Test',
        startDate: '2026-03-01',
        endDate: '2026-02-01',
      }).success,
    ).toBe(false);
  });

  it('campaign end date cannot precede start date', () => {
    expect(
      campaignSchema.safeParse({ name: 'Test', startDate: '2026-03-01', endDate: '2026-01-01' })
        .success,
    ).toBe(false);
  });

  it('case note follow-up requires a date', () => {
    expect(
      caseNoteSchema.safeParse({
        participantProfileId: uuid,
        noteDate: '2026-01-01',
        contactType: 'phone',
        category: 'housing',
        content: 'Called about lease.',
        followUpRequired: true,
      }).success,
    ).toBe(false);
  });

  it('ended employment requires an end date', () => {
    expect(
      employmentSchema.safeParse({
        participantProfileId: uuid,
        employerId: uuid2,
        jobTitle: 'Welder',
        status: 'resigned',
        startDate: '2026-01-01',
      }).success,
    ).toBe(false);
  });
});

describe('permission matrix sanity (§6.14)', () => {
  it('every role grants only defined permission keys', () => {
    const valid = new Set(ALL_PERMISSIONS);
    for (const role of ROLE_KEYS) {
      for (const key of ROLE_PERMISSIONS[role]) {
        expect(valid.has(key), `${role} grants unknown key ${key}`).toBe(true);
      }
    }
  });

  it('read_only holds no write, delete, export, or special permissions', () => {
    for (const key of permissionsForRole('read_only')) {
      // support.access is deliberately universal — every role files tickets.
      expect(
        key.endsWith('.read') || key === 'support.access',
        `read_only should not hold ${key}`,
      ).toBe(true);
    }
  });

  it('admin holds every permission', () => {
    expect(new Set(permissionsForRole('admin')).size).toBe(new Set(ALL_PERMISSIONS).size);
  });

  it('only admin holds confidential-note and merge special permissions', () => {
    for (const role of ROLE_KEYS.filter((r) => r !== 'admin')) {
      const perms = new Set<string>(permissionsForRole(role));
      expect(perms.has('case_notes.confidential.read'), role).toBe(false);
      expect(perms.has('person.merge'), role).toBe(false);
    }
  });
});
