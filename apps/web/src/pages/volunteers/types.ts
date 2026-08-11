import type {
  AssignmentStatus,
  AssignmentType,
  BackgroundCheckResult,
  ClearanceRequirementType,
  ClearanceStatus,
  HoursSource,
  HoursStatus,
  OpportunityStatus,
  ShiftSignupStatus,
  VolunteerStatus,
} from '@jumpstart/shared';

/** API response shapes for the volunteers area. Dates arrive as ISO strings. */

export interface PersonName {
  id: string;
  firstName: string;
  lastName: string;
}

export interface PersonBasics extends PersonName {
  preferredName?: string | null;
  primaryEmail?: string | null;
  primaryPhone?: string | null;
  city?: string | null;
  state?: string | null;
}

export interface PersonFull extends PersonBasics {
  middleName?: string | null;
  suffix?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  zip?: string | null;
  emailOk?: boolean;
  smsOk?: boolean;
  doNotContact?: boolean;
}

/**
 * §7.2: result / expiresAt / notes are stripped by the API when the viewer
 * lacks fields.background_checks.read — hence optional, render '—' when absent.
 */
export interface BackgroundCheckRow {
  id: string;
  personId: string;
  vendor: string;
  package: string | null;
  orderedAt: string;
  completedAt: string | null;
  result?: BackgroundCheckResult;
  expiresAt?: string | null;
  notes?: string | null;
  createdAt: string;
  person?: PersonName;
}

export interface VolunteerProfileFields {
  id: string;
  personId: string;
  status: VolunteerStatus;
  isMentor: boolean;
  mentorStatus: string | null;
  volunteerRoles: string[];
  availability: string | null;
  churchAffiliation: string | null;
  notes: string | null;
  createdAt: string;
}

export interface VolunteerListItem extends VolunteerProfileFields {
  person: PersonBasics;
  latestBackgroundCheck: BackgroundCheckRow | null;
}

export interface NamedRef {
  id: string;
  name: string;
}

export interface AssignmentRow {
  id: string;
  volunteerProfileId: string;
  assignmentType: AssignmentType;
  institutionId: string | null;
  insideClassId: string | null;
  outsideProgramId: string | null;
  eventId: string | null;
  role: string | null;
  startDate: string;
  endDate: string | null;
  status: AssignmentStatus;
  notes: string | null;
  clearanceOverride: boolean;
  clearanceOverrideReason: string | null;
  institution: NamedRef | null;
  insideClass: NamedRef | null;
  outsideProgram: (NamedRef & { programType?: string }) | null;
  event: (NamedRef & { eventDate?: string }) | null;
}

export interface TrainingRow {
  id: string;
  volunteerProfileId: string;
  trainingType: string;
  completedAt: string;
  expiresAt: string | null;
  notes: string | null;
  volunteerProfile?: { id: string; person: PersonName };
}

export interface RequirementRef {
  id: string;
  name: string;
  requirementType: ClearanceRequirementType;
  hardBlock: boolean;
  renewalMonths?: number | null;
  institution: NamedRef & { state?: string };
}

export interface ClearanceRow {
  id: string;
  volunteerProfileId: string;
  requirementId: string;
  status: ClearanceStatus;
  issuedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  requirement: RequirementRef;
  volunteerProfile?: { id: string; person: PersonName };
}

export interface RequirementRow {
  id: string;
  institutionId: string;
  name: string;
  requirementType: ClearanceRequirementType;
  description: string | null;
  renewalMonths: number | null;
  hardBlock: boolean;
  active: boolean;
  institution?: NamedRef & { state?: string };
}

export interface VolunteerDetail extends VolunteerProfileFields {
  person: PersonFull;
  backgroundChecks: BackgroundCheckRow[];
  assignments: AssignmentRow[];
  trainings: TrainingRow[];
  clearances: ClearanceRow[];
  /** Approved-hours rollup — optional so the page degrades while the API lands. */
  hoursSummary?: VolunteerHoursSummary;
  /** Next 5 upcoming shift signups with opportunity names. */
  upcomingSignups?: UpcomingSignupRow[];
}

/** GET /volunteers/:id/eligibility — computed, never stored (§6.6). */
export interface MissingClearanceItem {
  requirement: {
    id: string;
    name: string;
    requirementType: ClearanceRequirementType;
    hardBlock: boolean;
  };
  status: ClearanceStatus | 'missing';
  expiresAt: string | null;
}

export interface EligibilityResult {
  eligible: boolean;
  missing: MissingClearanceItem[];
}

/** GET /volunteers/expirations — §6.6 coordinator dashboard. */
export interface ExpirationsResult {
  days: number;
  backgroundChecks: Array<
    BackgroundCheckRow & {
      person: PersonName & { volunteerProfile: { id: string } | null };
    }
  >;
  trainings: TrainingRow[];
  clearances: ClearanceRow[];
}

export interface ServiceHistoryResult {
  volunteer: VolunteerProfileFields & { person: PersonName };
  assignments: Array<
    AssignmentRow & {
      institution: (NamedRef & { state?: string }) | null;
      outsideProgram: (NamedRef & { programType: string }) | null;
      event: (NamedRef & { eventDate: string }) | null;
    }
  >;
  /** Sum of approved hours entries (Decimal serialized). */
  totalApprovedHours?: string | number;
}

// ── Volunteer engagement: opportunities, shifts & hours ─────────────────────

export interface OpportunityFields {
  id: string;
  name: string;
  description: string | null;
  /** Chapter column. */
  state: string | null;
  institutionId: string | null;
  outsideProgramId: string | null;
  eventId: string | null;
  location: string | null;
  status: OpportunityStatus;
  notes: string | null;
  createdAt: string;
  institution?: NamedRef | null;
  outsideProgram?: (NamedRef & { programType?: string }) | null;
  event?: (NamedRef & { eventDate?: string }) | null;
}

export interface OpportunityListItem extends OpportunityFields {
  shiftCount: number;
  upcomingShiftCount: number;
  signupCount: number;
  /** Sum of approved hours (Prisma Decimal — arrives serialized). */
  approvedHours: string | number;
}

export interface ShiftSignupRow {
  id: string;
  shiftId: string;
  volunteerProfileId: string;
  status: ShiftSignupStatus;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  notes: string | null;
  volunteerProfile: { id: string; person: PersonName };
}

/**
 * Mutation responses on signups: the created/updated row; when a cancellation
 * frees a seat the API also returns the auto-promoted waitlisted signup.
 */
export interface SignupMutationResult extends ShiftSignupRow {
  promoted?: ShiftSignupRow | null;
}

export interface ShiftRow {
  id: string;
  opportunityId: string;
  shiftDate: string;
  /** 24-hour HH:MM. */
  startTime: string;
  endTime: string;
  capacity: number | null;
  role: string | null;
  location: string | null;
  notes: string | null;
  signedUpCount: number;
  waitlistCount: number;
  signups: ShiftSignupRow[];
}

export interface OpportunityHoursSummary {
  totalApproved: string | number;
  approvedEntries: number;
  pendingEntries: number;
}

export interface OpportunityDetail extends OpportunityFields {
  shifts: ShiftRow[];
  hoursSummary: OpportunityHoursSummary;
}

export interface HoursEntryRow {
  id: string;
  volunteerProfileId: string;
  activityDate: string;
  hours: string | number;
  description: string | null;
  opportunityId: string | null;
  shiftId: string | null;
  institutionId: string | null;
  assignmentId: string | null;
  source: HoursSource;
  status: HoursStatus;
  approvedById: string | null;
  approvedAt: string | null;
  createdAt: string;
  volunteerProfile?: { id: string; person: PersonName };
  opportunity?: NamedRef | null;
  institution?: NamedRef | null;
}

export interface VolunteerHoursSummary {
  totalApproved: string | number;
  ytdApproved: string | number;
  pendingCount: number;
}

/**
 * GET /volunteers/hours/summary — a server aggregate over the same filters the
 * hours list accepts. Distinct from VolunteerHoursSummary above, which is the
 * per-volunteer shape on the volunteer detail tab.
 */
export interface HoursSummary {
  count: number;
  totalHours: number;
}

export interface UpcomingSignupRow {
  id: string;
  status: ShiftSignupStatus;
  shift: {
    id: string;
    shiftDate: string;
    startTime: string;
    endTime: string;
    role: string | null;
    opportunity: NamedRef;
  };
}

/** §5 duplicate prevention: candidates returned in the 409 body on create. */
export interface DuplicateCandidate {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  city: string | null;
  state: string | null;
  volunteerProfile: { id: string; status: VolunteerStatus; deletedAt: string | null } | null;
}
