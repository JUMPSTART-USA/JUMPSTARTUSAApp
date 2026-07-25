import type { FinalAssessment, HousingStatus, UsState } from '@jumpstart/shared';
import type { ParticipantRef } from '@/pages/outside-programs/types';

export interface TransitionalHome {
  id: string;
  name: string;
  addressLine1: string | null;
  city: string | null;
  state: UsState;
  zip: string | null;
  phone: string | null;
  houseManagerName: string | null;
  houseManagerPhone: string | null;
  houseManagerEmail: string | null;
  capacity: number;
  active: boolean;
  notes: string | null;
  createdAt: string;
}

export interface HomeRow extends TransitionalHome {
  occupied: number;
  /** May go negative — over capacity is surfaced, never blocked (§6.4). */
  available: number;
}

export interface Resident {
  enrollmentId: string;
  participantProfileId: string;
  participantNumber: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  moveInDate: string;
}

export interface OccupancyEntry {
  home: TransitionalHome;
  capacity: number;
  occupied: number;
  available: number;
  currentResidents: Resident[];
}

export interface HousingEnrollment {
  id: string;
  participantProfileId: string;
  homeId: string;
  moveInDate: string;
  moveOutDate: string | null;
  status: HousingStatus;
  reasonForLeaving: string | null;
  completionAssessment: FinalAssessment | null;
  assessmentNotes: string | null;
  outsideProgramEnrollmentId: string | null;
  notes: string | null;
}

export interface HousingEnrollmentRow extends HousingEnrollment {
  home: { id: string; name: string; state: UsState };
  participantProfile: ParticipantRef;
}

export interface HomeDetail extends TransitionalHome {
  /** Current (active) enrollments only — history comes from /housing-enrollments. */
  enrollments: Array<HousingEnrollment & { participantProfile: ParticipantRef }>;
}

export interface TransferResult {
  closed: HousingEnrollment;
  opened: HousingEnrollment;
  warnings: string[];
}
