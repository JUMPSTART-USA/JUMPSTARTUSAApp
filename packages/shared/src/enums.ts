// Shared string-literal enums. These MUST stay in sync with the Prisma enums
// in packages/database/prisma/schema.prisma — the web app cannot import the
// Prisma client, so this is the browser-safe mirror. A unit test in the API
// package asserts the two stay identical.

export const GENDERS = ['male', 'female', 'other', 'unspecified'] as const;
export type Gender = (typeof GENDERS)[number];

// OMB (federal) standard race categories + two-or-more + unspecified
export const RACES = [
  'american_indian_alaska_native',
  'asian',
  'black_african_american',
  'native_hawaiian_pacific_islander',
  'white',
  'two_or_more',
  'unspecified',
] as const;
export type Race = (typeof RACES)[number];
export const RACE_LABELS: Record<Race, string> = {
  american_indian_alaska_native: 'American Indian or Alaska Native',
  asian: 'Asian',
  black_african_american: 'Black or African American',
  native_hawaiian_pacific_islander: 'Native Hawaiian or Other Pacific Islander',
  white: 'White',
  two_or_more: 'Two or More Races',
  unspecified: 'Unspecified',
};

// Transitional-home resident-gender restriction ("any" = no restriction)
export const HOME_GENDERS = ['male', 'female', 'any'] as const;
export type HomeGender = (typeof HOME_GENDERS)[number];
export const HOME_GENDER_LABELS: Record<HomeGender, string> = {
  male: 'Male',
  female: 'Female',
  any: 'Any',
};

// Drug-test tracking (outside programs)
export const DRUG_TEST_TYPES = [
  'urine_5_panel',
  'urine_10_panel',
  'urine_12_panel',
  'saliva',
  'breathalyzer',
  'hair_follicle',
  'other',
] as const;
export type DrugTestType = (typeof DRUG_TEST_TYPES)[number];
export const DRUG_TEST_TYPE_LABELS: Record<DrugTestType, string> = {
  urine_5_panel: 'Urine (5-panel)',
  urine_10_panel: 'Urine (10-panel)',
  urine_12_panel: 'Urine (12-panel)',
  saliva: 'Saliva',
  breathalyzer: 'Breathalyzer',
  hair_follicle: 'Hair follicle',
  other: 'Other',
};

export const DRUG_TEST_RESULTS = [
  'negative',
  'positive',
  'inconclusive',
  'diluted',
  'refused',
] as const;
export type DrugTestResult = (typeof DRUG_TEST_RESULTS)[number];
export const DRUG_TEST_RESULT_LABELS: Record<DrugTestResult, string> = {
  negative: 'Negative',
  positive: 'Positive',
  inconclusive: 'Inconclusive',
  diluted: 'Diluted',
  refused: 'Refused',
};

// Participant budget tracking (case management)
export const BUDGET_CATEGORIES = [
  'program_fee',
  'tithe',
  'supervision_fee',
  'treatment_program',
  'restitution',
  'child_support',
  'rent',
  'utilities',
  'transportation',
  'phone',
  'medical',
  'personal',
  'savings',
  'other',
] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];
export const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, string> = {
  program_fee: 'Program fee',
  tithe: 'Tithe',
  supervision_fee: 'Supervision fee (probation / parole / community supervision)',
  treatment_program: 'Treatment program',
  restitution: 'Restitution',
  child_support: 'Child support',
  rent: 'Rent',
  utilities: 'Utilities',
  transportation: 'Transportation',
  phone: 'Phone',
  medical: 'Medical',
  personal: 'Personal expenses',
  savings: 'Savings',
  other: 'Other',
};

export const BUDGET_FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'one_time'] as const;
export type BudgetFrequency = (typeof BUDGET_FREQUENCIES)[number];
export const BUDGET_FREQUENCY_LABELS: Record<BudgetFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  monthly: 'Monthly',
  one_time: 'One-time',
};

// Travel-away requests (case management)
export const TRAVEL_REQUEST_STATUSES = ['pending', 'approved', 'denied', 'canceled'] as const;
export type TravelRequestStatus = (typeof TRAVEL_REQUEST_STATUSES)[number];
export const TRAVEL_REQUEST_STATUS_LABELS: Record<TravelRequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
  canceled: 'Canceled',
};

// Incident reports (case management)
export const INCIDENT_CATEGORIES = [
  'curfew_violation',
  'unauthorized_absence',
  'substance_use',
  'failed_drug_test',
  'contraband',
  'altercation',
  'property_damage',
  'noncompliance',
  'other',
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];
export const INCIDENT_CATEGORY_LABELS: Record<IncidentCategory, string> = {
  curfew_violation: 'Curfew violation',
  unauthorized_absence: 'Unauthorized absence',
  substance_use: 'Substance use',
  failed_drug_test: 'Failed drug test',
  contraband: 'Contraband',
  altercation: 'Altercation',
  property_damage: 'Property damage',
  noncompliance: 'Program rules noncompliance',
  other: 'Other',
};

export const INCIDENT_SEVERITIES = ['minor', 'major', 'critical'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];
export const INCIDENT_SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  minor: 'Minor',
  major: 'Major',
  critical: 'Critical',
};

export const INCIDENT_STATUSES = ['open', 'in_review', 'resolved', 'dismissed'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  open: 'Open',
  in_review: 'In review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

// Participant portal (tokenized links, staff-reviewed queues)
export const PORTAL_MESSAGE_STATUSES = ['new', 'read', 'responded'] as const;
export type PortalMessageStatus = (typeof PORTAL_MESSAGE_STATUSES)[number];
export const PORTAL_MESSAGE_STATUS_LABELS: Record<PortalMessageStatus, string> = {
  new: 'New',
  read: 'Read',
  responded: 'Responded',
};

export const MEETING_REQUEST_STATUSES = ['pending', 'scheduled', 'declined', 'canceled'] as const;
export type MeetingRequestStatus = (typeof MEETING_REQUEST_STATUSES)[number];
export const MEETING_REQUEST_STATUS_LABELS: Record<MeetingRequestStatus, string> = {
  pending: 'Pending',
  scheduled: 'Scheduled',
  declined: 'Declined',
  canceled: 'Canceled',
};

export const TRANSPORT_REQUEST_STATUSES = [
  'pending',
  'approved',
  'denied',
  'canceled',
  'completed',
] as const;
export type TransportRequestStatus = (typeof TRANSPORT_REQUEST_STATUSES)[number];
export const TRANSPORT_REQUEST_STATUS_LABELS: Record<TransportRequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
  canceled: 'Canceled',
  completed: 'Completed',
};

export const INSIDE_CLASS_TYPES = ['pre_release', 'character', 'other'] as const;
export type InsideClassType = (typeof INSIDE_CLASS_TYPES)[number];
export const INSIDE_CLASS_TYPE_LABELS: Record<InsideClassType, string> = {
  pre_release: 'Pre-Release',
  character: 'Character',
  other: 'Other',
};

export const INSIDE_STATUSES = [
  'not_applicable',
  'enrolled',
  'active',
  'completed',
  'released',
  'withdrawn',
] as const;
export type InsideStatus = (typeof INSIDE_STATUSES)[number];

/** Most serious offenses (§7.2 justice field class). */
export const OFFENSE_TYPES = ['violent', 'non_violent'] as const;
export type OffenseType = (typeof OFFENSE_TYPES)[number];
export const OFFENSE_TYPE_LABELS: Record<OffenseType, string> = {
  violent: 'Violent',
  non_violent: 'Non-violent',
};

/** Inside locations: active = current institution; inactive = they left. */
export const INSIDE_LOCATION_STATUSES = ['active', 'inactive'] as const;
export type InsideLocationStatus = (typeof INSIDE_LOCATION_STATUSES)[number];

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

/**
 * Housing statuses that mean the resident has moved out. Includes
 * assessment_pending: the resident is physically out (move-out date + reason
 * required) even while the Blue/Green/Yellow/Red assessment is still due.
 */
export const HOUSING_EXIT_STATUSES = [
  'completed',
  'assessment_pending',
  'left_early',
  'removed',
  'transferred',
] as const;

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

// ── Volunteer engagement: opportunities, shifts & hours (§6.6) ──────────────

export const OPPORTUNITY_STATUSES = ['draft', 'open', 'closed', 'archived'] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  closed: 'Closed',
  archived: 'Archived',
};

export const SHIFT_SIGNUP_STATUSES = [
  'signed_up',
  'confirmed',
  'attended',
  'no_show',
  'canceled',
  'waitlisted',
] as const;
export type ShiftSignupStatus = (typeof SHIFT_SIGNUP_STATUSES)[number];

export const SHIFT_SIGNUP_STATUS_LABELS: Record<ShiftSignupStatus, string> = {
  signed_up: 'Signed up',
  confirmed: 'Confirmed',
  attended: 'Attended',
  no_show: 'No-show',
  canceled: 'Canceled',
  waitlisted: 'Waitlisted',
};

export const HOURS_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type HoursStatus = (typeof HOURS_STATUSES)[number];

export const HOURS_STATUS_LABELS: Record<HoursStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

export const HOURS_SOURCES = ['staff', 'self', 'check_in'] as const;
export type HoursSource = (typeof HOURS_SOURCES)[number];

export const HOURS_SOURCE_LABELS: Record<HoursSource, string> = {
  staff: 'Staff entered',
  self: 'Self reported',
  check_in: 'Check-in',
};

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

/**
 * Canonical outcome vocabularies. Every surface that feeds outcome reporting
 * (staff check-ins, the tokenized alumni self-update form, imports) MUST use
 * these values or a documented subset — cohort reports group by them (§9.3).
 */
export const OUTCOME_EMPLOYMENT_STATUSES = [
  'employed_ft',
  'employed_pt',
  'seeking',
  'unable',
  'unknown',
] as const;
export type OutcomeEmploymentStatus = (typeof OUTCOME_EMPLOYMENT_STATUSES)[number];

export const OUTCOME_HOUSING_STATUSES = [
  'stable',
  'transitional',
  'unstable',
  'incarcerated',
  'unknown',
] as const;
export type OutcomeHousingStatus = (typeof OUTCOME_HOUSING_STATUSES)[number];

export const DONOR_TYPES = [
  'individual',
  'organization',
  'church',
  'business',
  'foundation',
] as const;
export type DonorType = (typeof DONOR_TYPES)[number];

// ── Development: giving schedules, tributes, interactions & tasks (§6.8) ────

export const GIFT_FREQUENCIES = [
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'semiannually',
  'annually',
] as const;
export type GiftFrequency = (typeof GIFT_FREQUENCIES)[number];

export const GIFT_FREQUENCY_LABELS: Record<GiftFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Every other week',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semiannually: 'Twice a year',
  annually: 'Annually',
};

export const PLEDGE_STATUSES = ['active', 'fulfilled', 'written_off', 'canceled'] as const;
export type PledgeStatus = (typeof PLEDGE_STATUSES)[number];

export const PLEDGE_STATUS_LABELS: Record<PledgeStatus, string> = {
  active: 'Active',
  fulfilled: 'Fulfilled',
  written_off: 'Written off',
  canceled: 'Canceled',
};

export const RECURRING_GIFT_STATUSES = ['active', 'paused', 'closed'] as const;
export type RecurringGiftStatus = (typeof RECURRING_GIFT_STATUSES)[number];

export const RECURRING_GIFT_STATUS_LABELS: Record<RecurringGiftStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  closed: 'Closed',
};

export const INTERACTION_CHANNELS = [
  'email',
  'phone',
  'mail',
  'in_person',
  'text_message',
  'social_media',
  'website',
  'other',
] as const;
export type InteractionChannel = (typeof INTERACTION_CHANNELS)[number];

export const INTERACTION_CHANNEL_LABELS: Record<InteractionChannel, string> = {
  email: 'Email',
  phone: 'Phone',
  mail: 'Mail',
  in_person: 'In person',
  text_message: 'Text message',
  social_media: 'Social media',
  website: 'Website',
  other: 'Other',
};

export const INTERACTION_PURPOSES = [
  'acknowledgment',
  'cultivation',
  'newsletter',
  'receipt',
  'solicitation',
  'event_followup',
  'pledge_reminder',
  'welcome',
  'other',
] as const;
export type InteractionPurpose = (typeof INTERACTION_PURPOSES)[number];

export const INTERACTION_PURPOSE_LABELS: Record<InteractionPurpose, string> = {
  acknowledgment: 'Acknowledgment',
  cultivation: 'Cultivation',
  newsletter: 'Newsletter',
  receipt: 'Receipt',
  solicitation: 'Solicitation',
  event_followup: 'Event follow-up',
  pledge_reminder: 'Pledge reminder',
  welcome: 'Welcome',
  other: 'Other',
};

export const DONOR_TASK_STATUSES = ['open', 'completed', 'canceled'] as const;
export type DonorTaskStatus = (typeof DONOR_TASK_STATUSES)[number];

export const DONOR_TASK_STATUS_LABELS: Record<DonorTaskStatus, string> = {
  open: 'Open',
  completed: 'Completed',
  canceled: 'Canceled',
};

export const TRIBUTE_TYPES = ['in_honor_of', 'in_memory_of'] as const;
export type TributeType = (typeof TRIBUTE_TYPES)[number];

export const TRIBUTE_TYPE_LABELS: Record<TributeType, string> = {
  in_honor_of: 'In honor of',
  in_memory_of: 'In memory of',
};

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

// ── Preferred languages (§6.1) ──────────────────────────────────────────────
// The standard language list used on US government agency forms (Census
// Bureau / federal LEP guidance), plus ASL and Other.
export const PREFERRED_LANGUAGES = [
  'English',
  'Spanish',
  'Chinese',
  'Vietnamese',
  'Korean',
  'Tagalog',
  'Russian',
  'Arabic',
  'Haitian Creole',
  'French',
  'Polish',
  'Portuguese',
  'Italian',
  'German',
  'Japanese',
  'Persian (Farsi)',
  'Hindi',
  'Urdu',
  'Bengali',
  'Amharic',
  'Somali',
  'Swahili',
  'Navajo',
  'American Sign Language (ASL)',
  'Other',
] as const;

/** Legacy ISO-ish codes stored before the dropdown existed. */
export const LEGACY_LANGUAGE_CODES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  zh: 'Chinese',
  vi: 'Vietnamese',
  ko: 'Korean',
  tl: 'Tagalog',
  ru: 'Russian',
  ar: 'Arabic',
  ht: 'Haitian Creole',
  fr: 'French',
};

// ── Case service types (§6.5) ───────────────────────────────────────────────
// Standard service menu for participants in transitional housing / reentry.
// Admins may override the list via the `services.types` app setting.
export const DEFAULT_SERVICE_TYPES = [
  'Case management session',
  'Housing placement',
  'Rental assistance',
  'Utility assistance',
  'Food assistance',
  'Clothing assistance',
  'Hygiene supplies',
  'Furniture / household goods',
  'Transportation assistance',
  'Bus pass',
  'Phone / phone minutes',
  'ID / documents assistance',
  'Benefits enrollment (SNAP, Medicaid…)',
  'Health insurance enrollment',
  'Medical / dental referral',
  'Mental health counseling referral',
  'Substance abuse treatment referral',
  'Employment readiness',
  'Job placement',
  'Vocational training',
  'Education / GED support',
  'Life skills training',
  'Financial literacy / budgeting',
  'Legal aid referral',
  'Child support assistance',
  'Family reunification support',
  'Mentoring',
  'Spiritual support',
  'Peer support group',
  'Emergency financial assistance',
  'Other',
] as const;
