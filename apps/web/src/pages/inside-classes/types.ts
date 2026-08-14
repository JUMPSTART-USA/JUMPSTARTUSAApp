/** Response shapes for the inside-classes module (see inside-classes.service.ts). */
import type { ClassStatus, EnrollmentStatus, FinalAssessment } from '@jumpstart/shared';

export interface InsideClassListItem {
  id: string;
  institutionId: string;
  name: string;
  classType: string | null;
  startDate: string;
  endDate: string | null;
  status: ClassStatus;
  staffLeadId: string | null;
  notes: string | null;
  institution: { id: string; name: string; state: string };
  _count: { enrollments: number };
}

export interface RosterEnrollment {
  id: string;
  participantProfileId: string;
  insideClassId: string;
  enrollmentDate: string;
  completionStatus: EnrollmentStatus;
  completionDate: string | null;
  leftEarlyDate: string | null;
  leftEarlyReason: string | null;
  finalAssessment: FinalAssessment | null;
  assessmentNotes: string | null;
  notes: string | null;
  participantProfile: {
    id: string;
    participantNumber: string | null;
    person: { firstName: string; lastName: string; preferredName: string | null };
  };
}

export interface InsideClassDetail {
  id: string;
  institutionId: string;
  name: string;
  classType: string | null;
  startDate: string;
  endDate: string | null;
  status: ClassStatus;
  staffLeadId: string | null;
  notes: string | null;
  institution: { id: string; name: string; state: string; city: string | null };
  staffLead: { id: string; firstName: string; lastName: string } | null;
  enrollments: RosterEnrollment[];
  volunteerAssignments: Array<{
    id: string;
    role: string | null;
    status: string;
    startDate: string;
    endDate: string | null;
    volunteerProfile: { id: string; person: { firstName: string; lastName: string } };
  }>;
}

// Re-exported from shared so rows type-match what the API now accepts
// (includes 'late'); the vocabulary lives in one place.
export type { AttendanceStatus } from '@jumpstart/shared';
import type { AttendanceStatus } from '@jumpstart/shared';

export interface ClassSession {
  id: string;
  insideClassId: string;
  sessionDate: string;
  topic: string | null;
  notes: string | null;
  attendance: Array<{
    id: string;
    sessionId: string;
    enrollmentId: string;
    status: AttendanceStatus;
    notes: string | null;
  }>;
}

export interface InstitutionOption {
  id: string;
  name: string;
  state: string;
}

/** Minimal shape of GET /participants list rows used by the batch-enroll picker. */
export interface ParticipantPickerItem {
  id: string;
  participantNumber: string | null;
  person: { firstName: string; lastName: string; preferredName: string | null };
}
