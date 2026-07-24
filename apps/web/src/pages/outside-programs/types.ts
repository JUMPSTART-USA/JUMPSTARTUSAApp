import type {
  EnrollmentStatus,
  FinalAssessment,
  ProgramType,
  UsState,
} from '@jumpstart/shared';

/** Participant reference shape returned by every roster/enrollment include. */
export interface ParticipantRef {
  id: string;
  participantNumber: string;
  person: { firstName: string; lastName: string; preferredName?: string | null };
}

export interface StaffRef {
  id: string;
  firstName: string;
  lastName: string;
}

export type OutsideProgramStatus = 'active' | 'inactive' | 'completed';

export interface OutsideProgram {
  id: string;
  name: string;
  programType: ProgramType;
  location: string | null;
  state: UsState | null;
  startDate: string | null;
  endDate: string | null;
  recurringSchedule: string | null;
  staffLeadId: string | null;
  volunteerLeadName: string | null;
  capacity: number | null;
  status: OutsideProgramStatus;
  notes: string | null;
  createdAt: string;
  staffLead?: StaffRef | null;
}

export interface OutsideProgramRow extends OutsideProgram {
  activeEnrollmentCount: number;
  _count?: { enrollments: number };
}

export interface OutsideEnrollment {
  id: string;
  participantProfileId: string;
  outsideProgramId: string;
  enrollmentDate: string;
  status: EnrollmentStatus;
  completionDate: string | null;
  leftEarlyDate: string | null;
  leftEarlyReason: string | null;
  completionAssessment: FinalAssessment | null;
  assessmentNotes: string | null;
  notes: string | null;
  participantProfile: ParticipantRef;
}

export interface OutsideProgramDetail extends OutsideProgram {
  enrollments: OutsideEnrollment[];
}

export interface OutsideSession {
  id: string;
  outsideProgramId: string;
  sessionDate: string;
  topic: string | null;
  notes: string | null;
  _count?: { attendance: number };
}

export type AttendanceStatus = 'present' | 'absent' | 'excused';
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['present', 'absent', 'excused'];

export interface OutsideSessionDetail extends Omit<OutsideSession, '_count'> {
  outsideProgram: { id: string; name: string };
  attendance: Array<{
    enrollmentId: string;
    status: AttendanceStatus;
    notes: string | null;
    enrollment: {
      id: string;
      status: EnrollmentStatus;
      participantProfile: ParticipantRef;
    };
  }>;
}
