/** Response shapes for the institutions module (see institutions.service.ts). */

export interface Institution {
  id: string;
  name: string;
  institutionType: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string;
  zip: string | null;
  mainPhone: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
}

/** Any number per facility: chaplains, wardens, program/release coordinators… */
export interface InstitutionContactRow {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

export interface InstitutionListItem extends Institution {
  _count: { insideClasses: number; contacts: number };
  /** First contact (role asc, name asc) for the list summary. */
  contacts: Pick<InstitutionContactRow, 'id' | 'name' | 'role'>[];
}

export interface InstitutionClassRow {
  id: string;
  name: string;
  classType: string | null;
  startDate: string;
  endDate: string | null;
  status: string;
  _count: { enrollments: number };
}

export interface InstitutionVolunteerAssignment {
  id: string;
  assignmentType: string;
  role: string | null;
  startDate: string;
  endDate: string | null;
  status: string;
  volunteerProfile: {
    id: string;
    person: { firstName: string; lastName: string };
  };
}

export interface CurrentParticipantRow {
  id: string;
  startDate: string | null;
  participantProfile: {
    id: string;
    participantNumber: string;
    insideStatus: string;
    person: { firstName: string; lastName: string; preferredName: string | null };
  };
}

/** GET /institutions/:id/profile — §6.2 institution profile requirement. */
export interface InstitutionProfile {
  institution: Institution;
  contacts: InstitutionContactRow[];
  classes: InstitutionClassRow[];
  participantsServedCount: number;
  volunteerAssignments: InstitutionVolunteerAssignment[];
  /** Omitted by the API for viewers without participants.read. */
  currentParticipants?: CurrentParticipantRow[];
}
