import * as prisma from '@jumpstart/database';
import * as shared from '@jumpstart/shared';
import { describe, expect, it } from 'vitest';

/**
 * The browser-safe enum mirror in @jumpstart/shared MUST stay identical to the
 * Prisma enums (shared/src/enums.ts documents this contract). This test is the
 * enforcement.
 */
const PAIRS: Array<[string, readonly string[], Record<string, string>]> = [
  ['Gender', shared.GENDERS, prisma.Gender],
  ['InsideStatus', shared.INSIDE_STATUSES, prisma.InsideStatus],
  ['OutsideStatus', shared.OUTSIDE_STATUSES, prisma.OutsideStatus],
  ['AlumniStatus', shared.ALUMNI_STATUSES, prisma.AlumniStatus],
  ['OffenseType', shared.OFFENSE_TYPES, prisma.OffenseType],
  ['InsideLocationStatus', shared.INSIDE_LOCATION_STATUSES, prisma.InsideLocationStatus],
  ['EnrollmentStatus', shared.ENROLLMENT_STATUSES, prisma.EnrollmentStatus],
  ['HousingStatus', shared.HOUSING_STATUSES, prisma.HousingStatus],
  ['FinalAssessment', shared.FINAL_ASSESSMENTS, prisma.FinalAssessment],
  ['ClassStatus', shared.CLASS_STATUSES, prisma.ClassStatus],
  ['ProgramType', shared.PROGRAM_TYPES, prisma.ProgramType],
  ['ContactType', shared.CONTACT_TYPES, prisma.ContactType],
  ['DrugTestType', shared.DRUG_TEST_TYPES, prisma.DrugTestType],
  ['DrugTestResult', shared.DRUG_TEST_RESULTS, prisma.DrugTestResult],
  ['NoteCategory', shared.NOTE_CATEGORIES, prisma.NoteCategory],
  ['ChecklistItemStatus', shared.CHECKLIST_ITEM_STATUSES, prisma.ChecklistItemStatus],
  ['GoalStatus', shared.GOAL_STATUSES, prisma.GoalStatus],
  ['TaskStatus', shared.TASK_STATUSES, prisma.TaskStatus],
  ['VolunteerStatus', shared.VOLUNTEER_STATUSES, prisma.VolunteerStatus],
  ['AssignmentType', shared.ASSIGNMENT_TYPES, prisma.AssignmentType],
  ['AssignmentStatus', shared.ASSIGNMENT_STATUSES, prisma.AssignmentStatus],
  ['BackgroundCheckResult', shared.BACKGROUND_CHECK_RESULTS, prisma.BackgroundCheckResult],
  [
    'ClearanceRequirementType',
    shared.CLEARANCE_REQUIREMENT_TYPES,
    prisma.ClearanceRequirementType,
  ],
  ['ClearanceStatus', shared.CLEARANCE_STATUSES, prisma.ClearanceStatus],
  ['MentorScreeningStage', shared.MENTOR_SCREENING_STAGES, prisma.MentorScreeningStage],
  ['MentorAssignmentStatus', shared.MENTOR_ASSIGNMENT_STATUSES, prisma.MentorAssignmentStatus],
  ['SessionMode', shared.SESSION_MODES, prisma.SessionMode],
  ['EngagementType', shared.ENGAGEMENT_TYPES, prisma.EngagementType],
  ['CheckinWave', shared.CHECKIN_WAVES, prisma.CheckinWave],
  ['CheckinMethod', shared.CHECKIN_METHODS, prisma.CheckinMethod],
  ['VerificationLevel', shared.VERIFICATION_LEVELS, prisma.VerificationLevel],
  ['DonorType', shared.DONOR_TYPES, prisma.DonorType],
  ['EmploymentStatus', shared.EMPLOYMENT_STATUSES, prisma.EmploymentStatus],
  ['HiringStatus', shared.HIRING_STATUSES, prisma.HiringStatus],
  ['CommChannel', shared.COMM_CHANNELS, prisma.CommChannel],
  ['CommStatus', shared.COMM_STATUSES, prisma.CommStatus],
  ['IntakeStatus', shared.INTAKE_STATUSES, prisma.IntakeStatus],
  ['ReferrerType', shared.REFERRER_TYPES, prisma.ReferrerType],
  ['AttachmentSensitivity', shared.ATTACHMENT_SENSITIVITIES, prisma.AttachmentSensitivity],
  ['AuditAction', shared.AUDIT_ACTIONS, prisma.AuditAction],
  ['UserStatus', shared.USER_STATUSES, prisma.UserStatus],
];

describe('shared enums mirror Prisma enums value-for-value', () => {
  it.each(PAIRS.map(([name]) => name))('%s', (name) => {
    const [, sharedValues, prismaEnum] = PAIRS.find(([n]) => n === name)!;
    expect([...sharedValues].sort()).toEqual(Object.values(prismaEnum).sort());
  });
});
