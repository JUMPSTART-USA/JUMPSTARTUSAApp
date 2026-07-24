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
  chaplainName: string | null;
  chaplainPhone: string | null;
  chaplainEmail: string | null;
  primaryContactName: string | null;
  primaryContactRole: string | null;
  primaryContactPhone: string | null;
  primaryContactEmail: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
}

export interface InstitutionListItem extends Institution {
  _count: { insideClasses: number };
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

/** GET /institutions/:id/profile — §6.2 institution profile requirement. */
export interface InstitutionProfile {
  institution: Institution;
  classes: InstitutionClassRow[];
  participantsServedCount: number;
  volunteerAssignments: InstitutionVolunteerAssignment[];
}
