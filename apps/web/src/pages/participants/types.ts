/**
 * Response shapes for the participants area, mirrored from the Prisma
 * includes in apps/api/src/modules/participants (and the tab endpoints).
 * Dates arrive as ISO strings over JSON.
 */

export interface UserName {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

export interface PersonSummary {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  primaryPhone: string | null;
  primaryEmail: string | null;
  city: string | null;
  state: string | null;
}

export interface ParticipantListItem {
  id: string;
  participantNumber: string;
  insideStatus: string;
  outsideStatus: string;
  alumniStatus: string;
  phase: string | null;
  intakeDate: string | null;
  releaseDate: string | null;
  graduationDate: string | null;
  person: PersonSummary;
  assignedCaseManager: UserName | null;
}

export interface PersonContactRow {
  id: string;
  name: string;
  relationship: string;
  phone: string | null;
  email: string | null;
  isEmergency: boolean;
  isMinor: boolean;
  guardianName: string | null;
  notes: string | null;
}

export interface PersonAddressRow {
  id: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zip: string;
  addressType: string | null;
  isCurrent: boolean;
  validFrom: string | null;
  validTo: string | null;
  returnedMailAt: string | null;
  notes: string | null;
}

export interface TestimonyConsentRow {
  id: string;
  scope: string;
  grantedAt: string;
  revokedAt: string | null;
  notes: string | null;
}

/** §7.2: docNumber is stripped server-side without fields.justice.read. */
export interface DocIdRow {
  id: string;
  state: string;
  docNumber?: string;
  source: string;
  dataSharingAgreementId: string | null;
}

export interface PersonDetail {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
  suffix: string | null;
  dateOfBirth: string | null;
  gender: string;
  preferredLanguage: string | null;
  primaryPhone: string | null;
  primaryEmail: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  emailOk: boolean;
  smsOk: boolean;
  smsConsentAt: string | null;
  mailOnly: boolean;
  doNotContact: boolean;
  deceasedAt: string | null;
  contacts: PersonContactRow[];
  addresses: PersonAddressRow[];
  testimonyConsents: TestimonyConsentRow[];
}

export interface ParticipantDetail {
  id: string;
  participantNumber: string;
  insideStatus: string;
  outsideStatus: string;
  alumniStatus: string;
  phase: string | null;
  intakeDate: string | null;
  releaseDate: string | null;
  graduationDate: string | null;
  assignedCaseManagerId: string | null;
  notes: string | null;
  createdAt: string;
  person: PersonDetail;
  docIds: DocIdRow[];
  assignedCaseManager: UserName | null;
}

export interface DuplicateCandidate {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  dateOfBirth: string | null;
  primaryPhone: string | null;
  primaryEmail: string | null;
  city: string | null;
  state: string | null;
  participantProfileId: string | null;
  participantNumber: string | null;
  profileTypes: string[];
}

export interface StatusHistoryRow {
  id: string;
  domain: string;
  fromValue: string | null;
  toValue: string;
  effectiveDate: string;
  reason: string | null;
  createdAt: string;
}

export interface TimelineEventRow {
  type:
    | 'inside_enrollment'
    | 'outside_enrollment'
    | 'housing_enrollment'
    | 'case_note'
    | 'case_service'
    | 'employment'
    | 'status_change'
    | 'communication'
    | 'alumni_engagement';
  date: string;
  title: string;
  detail?: string | null;
  entityId: string;
}

// ── Tab endpoints from other modules ─────────────────────────────────────────

export interface HousingEnrollmentRow {
  id: string;
  moveInDate: string;
  moveOutDate: string | null;
  status: string;
  reasonForLeaving: string | null;
  completionAssessment: string | null;
  home: { id: string; name: string; state: string };
}

export interface EmploymentRow {
  id: string;
  jobTitle: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  /** §7.2 pay field class — absent unless the viewer holds fields.pay.read. */
  payRate?: string | number | null;
  payPeriod?: string | null;
  hoursPerWeek?: number | null;
  employer: { id: string; name: string };
}

export interface CaseServiceRow {
  id: string;
  serviceType: string;
  serviceDate: string;
  providerName: string | null;
  description: string | null;
  outcome: string | null;
  followUpRequired: boolean;
  followUpDate: string | null;
}

/** Confidential notes arrive as dated stubs with content '[Confidential note]'. */
export interface CaseNoteRow {
  id: string;
  noteDate: string;
  category: string;
  contactType?: string;
  content: string;
  confidential: boolean;
  followUpRequired?: boolean;
  followUpDate?: string | null;
  caseManagerName: string;
}

export interface ChecklistItemRow {
  id: string;
  label: string;
  sortOrder: number;
  required: boolean;
  status: string;
  completedAt: string | null;
  notes: string | null;
}

export interface ChecklistRow {
  id: string;
  startedAt: string;
  completedAt: string | null;
  template: { name: string } | null;
  items: ChecklistItemRow[];
}

export interface ServicePlanRow {
  id: string;
  title: string;
  status: string;
  reviewDate: string | null;
  notes: string | null;
  createdAt: string;
  _count: { goals: number };
}
