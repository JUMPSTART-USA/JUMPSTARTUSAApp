import type { EmploymentStatus, HiringStatus } from '@jumpstart/shared';

export interface Employer {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  city: string | null;
  /** Postal address state — NOT the chapter (§7.2). */
  state: string | null;
  zip: string | null;
  website: string | null;
  /** Chapter the employer belongs to (§7.2). */
  chapterState: string;
  industry: string | null;
  hiringStatus: HiringStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployerListItem extends Employer {
  _count: { employments: number };
}

export interface EmployerProfileEmployment {
  id: string;
  jobTitle: string;
  startDate: string | null;
  endDate: string | null;
  status: EmploymentStatus;
  participantProfile: {
    id: string;
    participantNumber: string;
    person: { firstName: string; lastName: string };
  };
}

export interface EmployerProfile {
  employer: Employer;
  employments: EmployerProfileEmployment[];
  outcomes: { placements: number; currentlyActive: number; retained90Days: number };
}

export interface EmploymentListItem {
  id: string;
  participantProfileId: string;
  employerId: string;
  jobTitle: string;
  startDate: string | null;
  endDate: string | null;
  status: EmploymentStatus;
  /** §7.2 pay field class — absent when the user lacks fields.pay.read. */
  payRate?: string | number | null;
  payPeriod?: 'hourly' | 'weekly' | 'annual' | null;
  hoursPerWeek?: number | null;
  supervisorName: string | null;
  supervisorPhone: string | null;
  notes: string | null;
  employer: { id: string; name: string };
  participantProfile: {
    id: string;
    participantNumber: string;
    person: { firstName: string; lastName: string };
  };
}

export interface EmploymentStatusHistoryEntry {
  id: string;
  employmentId: string;
  fromStatus: EmploymentStatus | null;
  toStatus: EmploymentStatus;
  effectiveDate: string;
  createdAt: string;
}

export interface EmploymentDetail extends EmploymentListItem {
  statusHistory: EmploymentStatusHistoryEntry[];
}
