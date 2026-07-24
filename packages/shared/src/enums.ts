// Shared string-literal enums. These MUST stay in sync with the Prisma enums
// in packages/database/prisma/schema.prisma — the web app cannot import the
// Prisma client, so this is the browser-safe mirror. A unit test in the API
// package asserts the two stay identical.

export const GENDERS = ['male', 'female', 'other', 'unspecified'] as const;
export type Gender = (typeof GENDERS)[number];

export const INSIDE_STATUSES = [
  'not_applicable',
  'enrolled',
  'active',
  'completed',
  'released',
  'withdrawn',
] as const;
export type InsideStatus = (typeof INSIDE_STATUSES)[number];

export const OUTSIDE_STATUSES = [
  'not_applicable',
  'intake',
  'active',
  'completed',
  'inactive',
  'withdrawn',
] as const;
export type OutsideStatus = (typeof OUTSIDE_STATUSES)[number];

export const ALUMNI_STATUSES = ['not_applicable', 'alumni', 'alumni_engaged'] as const;
export type AlumniStatus = (typeof ALUMNI_STATUSES)[number];

export const ENROLLMENT_STATUSES = [
  'enrolled',
  'active',
  'completed',
  'assessment_pending',
  'left_early',
  'removed',
  'transferred',
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

/** Enrollment statuses that mean "no longer in the class/program". */
export const ENROLLMENT_EXIT_STATUSES = [
  'completed',
  'left_early',
  'removed',
  'transferred',
] as const;

export const HOUSING_STATUSES = [
  'active',
  'completed',
  'assessment_pending',
  'left_early',
  'removed',
  'transferred',
] as const;
export type HousingStatus = (typeof HOUSING_STATUSES)[number];

/** Housing statuses that mean the resident has moved out. */
export const HOUSING_EXIT_STATUSES = ['completed', 'left_early', 'removed', 'transferred'] as const;

export const FINAL_ASSESSMENTS = ['blue', 'green', 'yellow', 'red'] as const;
export type FinalAssessment = (typeof FINAL_ASSESSMENTS)[number];

export const CLASS_STATUSES = ['planned', 'active', 'completed', 'canceled'] as const;
export type ClassStatus = (typeof CLASS_STATUSES)[number];

export const PROGRAM_TYPES = [
  'transitional_housing',
  'treatment',
  'life_skills',
  'soft_skills',
  'bible_study',
  'mentoring',
  'transportation',
  'employment_assistance',
  'case_management',
  'other',
] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];

export const CONTACT_TYPES = ['phone', 'in_person', 'email', 'text', 'video', 'other'] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const NOTE_CATEGORIES = [
  'housing',
  'employment',
  'treatment',
  'transportation',
  'life_skills',
  'spiritual_support',
  'legal',
  'family',
  'financial',
  'general',
] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

export const CHECKLIST_ITEM_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'not_applicable',
] as const;
export type ChecklistItemStatus = (typeof CHECKLIST_ITEM_STATUSES)[number];

export const GOAL_STATUSES = ['not_started', 'in_progress', 'achieved', 'abandoned'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const TASK_STATUSES = ['open', 'in_progress', 'completed', 'canceled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const VOLUNTEER_STATUSES = ['applicant', 'active', 'inactive', 'suspended'] as const;
export type VolunteerStatus = (typeof VOLUNTEER_STATUSES)[number];

export const ASSIGNMENT_TYPES = [
  'inside_class',
  'outside_class',
  'bible_study',
  'event',
  'transportation',
  'mentoring',
  'administration',
  'other',
] as const;
export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

export const ASSIGNMENT_STATUSES = ['proposed', 'active', 'completed', 'ended'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const BACKGROUND_CHECK_RESULTS = ['pending', 'clear', 'review', 'not_cleared'] as const;
export type BackgroundCheckResult = (typeof BACKGROUND_CHECK_RESULTS)[number];

export const CLEARANCE_REQUIREMENT_TYPES = [
  'background_check',
  'training',
  'document',
  'approval',
  'medical',
  'other',
] as const;
export type ClearanceRequirementType = (typeof CLEARANCE_REQUIREMENT_TYPES)[number];

export const CLEARANCE_STATUSES = ['pending', 'satisfied', 'expired', 'rejected'] as const;
export type ClearanceStatus = (typeof CLEARANCE_STATUSES)[number];

export const MENTOR_SCREENING_STAGES = [
  'applied',
  'interview',
  'background_check',
  'references',
  'mentor_training',
  'panel_approval',
  'approved',
  'rejected',
  'withdrawn',
] as const;
export type MentorScreeningStage = (typeof MENTOR_SCREENING_STAGES)[number];

export const MENTOR_ASSIGNMENT_STATUSES = ['proposed', 'active', 'paused', 'ended'] as const;
export type MentorAssignmentStatus = (typeof MENTOR_ASSIGNMENT_STATUSES)[number];

export const SESSION_MODES = ['in_person', 'phone', 'video'] as const;
export type SessionMode = (typeof SESSION_MODES)[number];

export const ENGAGEMENT_TYPES = [
  'event_attendance',
  'check_in_call',
  'newsletter',
  'volunteer_service',
  'gave_testimony',
  'donated',
  'other',
] as const;
export type EngagementType = (typeof ENGAGEMENT_TYPES)[number];

export const CHECKIN_WAVES = ['day_30', 'month_6', 'month_12', 'month_24', 'month_36'] as const;
export type CheckinWave = (typeof CHECKIN_WAVES)[number];

export const CHECKIN_METHODS = [
  'call',
  'sms',
  'mail',
  'event',
  'self_report',
  'in_person',
] as const;
export type CheckinMethod = (typeof CHECKIN_METHODS)[number];

export const VERIFICATION_LEVELS = ['self_reported', 'staff_verified', 'doc_verified'] as const;
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];

export const DONOR_TYPES = [
  'individual',
  'organization',
  'church',
  'business',
  'foundation',
] as const;
export type DonorType = (typeof DONOR_TYPES)[number];

export const EMPLOYMENT_STATUSES = [
  'applied',
  'interviewing',
  'hired',
  'active',
  'terminated',
  'resigned',
  'completed',
  'unknown',
] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export const HIRING_STATUSES = [
  'prospect',
  'partner',
  'actively_hiring',
  'paused',
  'inactive',
] as const;
export type HiringStatus = (typeof HIRING_STATUSES)[number];

export const COMM_CHANNELS = ['email', 'sms', 'letter'] as const;
export type CommChannel = (typeof COMM_CHANNELS)[number];

export const COMM_STATUSES = ['queued', 'sent', 'delivered', 'failed', 'returned'] as const;
export type CommStatus = (typeof COMM_STATUSES)[number];

export const INTAKE_STATUSES = ['pending', 'in_review', 'approved', 'rejected', 'spam'] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export const REFERRER_TYPES = ['self', 'family', 'chaplain', 'agency', 'church', 'other'] as const;
export type ReferrerType = (typeof REFERRER_TYPES)[number];

export const ATTACHMENT_SENSITIVITIES = ['standard', 'sensitive', 'confidential'] as const;
export type AttachmentSensitivity = (typeof ATTACHMENT_SENSITIVITIES)[number];

export const AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
  'login',
  'logout',
  'login_failed',
  'export',
  'permission_change',
  'read_confidential',
  'merge',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const USER_STATUSES = ['invited', 'active', 'deactivated'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC',
] as const;
export type UsState = (typeof US_STATES)[number];
