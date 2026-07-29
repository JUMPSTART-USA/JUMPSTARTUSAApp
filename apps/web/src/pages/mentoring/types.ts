import type {
  CheckinMethod,
  CheckinWave,
  EngagementType,
  MentorAssignmentStatus,
  MentorScreeningStage,
  SessionMode,
  VerificationLevel,
} from '@jumpstart/shared';

// ── API view shapes (mirrors the mentoring services' toView outputs) ─────────

export interface AssignmentView {
  id: string;
  mentorProfileId: string;
  participantProfileId: string;
  matchedById: string | null;
  startDate: string | null;
  endDate: string | null;
  status: MentorAssignmentStatus;
  endReason: string | null;
  pauseReason: string | null;
  matchRationale: string | null;
  meetingCadence: string | null;
  createdAt: string;
  updatedAt: string;
  mentorName: string;
  participantName: string;
  participantNumber: string;
}

export interface SessionLogView {
  id: string;
  mentorAssignmentId: string;
  sessionDate: string;
  mode: SessionMode;
  durationMinutes: number | null;
  participantProgress: string | null;
  concernsEscalated: boolean;
  notes: string | null;
  createdAt: string;
}

export interface CheckinView {
  id: string;
  participantProfileId: string;
  wave: CheckinWave;
  dueDate: string;
  completedDate: string | null;
  method: CheckinMethod | null;
  employmentStatus: string | null;
  housingStatus: string | null;
  reArrested: boolean | null;
  reArrestedVerification: VerificationLevel | null;
  reConvicted: boolean | null;
  reConvictedVerification: VerificationLevel | null;
  reIncarcerated: boolean | null;
  reIncarceratedVerification: VerificationLevel | null;
  justiceNotes: string | null;
  notes: string | null;
  participantProfile: {
    id: string;
    participantNumber: string;
    graduationDate: string | null;
    person: { firstName: string; lastName: string };
  };
}

export interface ScreeningCriterion {
  id: string;
  label: string;
  sortOrder: number;
  required: boolean;
  status: 'pending' | 'in_progress' | 'completed' | 'not_applicable';
  completedAt: string | null;
  notes: string | null;
}

export interface ScreeningStep {
  id: string;
  stage: MentorScreeningStage;
  outcome: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ScreeningListItem {
  id: string;
  volunteerProfileId: string;
  stage: MentorScreeningStage;
  approvedAt: string | null;
  conditions: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  volunteerName: string;
  isAlumni: boolean;
  criteriaTotal: number;
  criteriaCompleted: number;
}

export interface ScreeningDetail {
  id: string;
  volunteerProfileId: string;
  stage: MentorScreeningStage;
  approvedAt: string | null;
  conditions: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  volunteerName: string;
  isAlumni: boolean;
  criteria: ScreeningCriterion[];
  steps: ScreeningStep[];
}

export interface EngagementView {
  id: string;
  participantProfileId: string;
  engagementType: EngagementType;
  engagementDate: string;
  notes: string | null;
  createdAt: string;
  participantProfile: {
    id: string;
    participantNumber: string;
    person: { firstName: string; lastName: string };
  };
}

export interface OversightData {
  activeMatches: number;
  matchesNoSessionIn30Days: Array<AssignmentView & { lastSessionDate: string | null }>;
  screeningsInPipeline: Record<string, number>;
  alumniEngagementLast90Days: number;
  checkinsOverdue: number;
}

// ── Shared helpers ───────────────────────────────────────────────────────────

/** Selects use '' for the placeholder; optional Zod enums want undefined. */
export const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

/**
 * Overdue matches the server rule (dueDate < UTC today), so compare date
 * strings — a check-in due today is not yet overdue.
 */
export function isOverdue(c: Pick<CheckinView, 'dueDate' | 'completedDate'>): boolean {
  if (c.completedDate) return false;
  return c.dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10);
}
