import type {
  AssignmentStatus,
  AssignmentType,
  BackgroundCheckResult,
  ClearanceRequirementType,
  ClearanceStatus,
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
