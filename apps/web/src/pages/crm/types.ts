// Response shapes for the CRM module (apps/api/src/modules/crm). Donors and
// donations are a read-mostly Bloomerang mirror (§6.8) — money fields arrive as
// Prisma Decimal strings, computed aggregates as numbers.

export interface PersonRef {
  id: string;
  firstName: string;
  lastName: string;
  preferredName?: string | null;
}

export interface NamedRef {
  id: string;
  name: string;
}

export interface Donor {
  id: string;
  donorType: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  status: string;
  personId: string | null;
  notes: string | null;
  bloomerangId?: string | null;
  lastSyncedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DonorListItem extends Donor {
  lifetimeGiving: number;
  lastGiftDate: string | null;
}

export interface Donation {
  id: string;
  donorId: string;
  donationDate: string;
  amount: string | number;
  paymentMethod: string | null;
  fund: string | null;
  isRecurring: boolean;
  receiptSent: boolean;
  campaignId: string | null;
  eventId: string | null;
  notes: string | null;
  donor?: NamedRef;
  campaign?: NamedRef | null;
  event?: NamedRef | null;
}

export interface DonorDetail {
  donor: Donor & { person: PersonRef | null };
  donations: Donation[];
  lifetimeGiving: number;
  lastGiftDate: string | null;
  campaigns: NamedRef[];
  events: NamedRef[];
}

export interface DonationSummary {
  count: number;
  total: number;
}

export type CampaignStatus = 'planned' | 'active' | 'completed' | 'canceled';

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  goalAmount: string | number | null;
  status: CampaignStatus;
  notes: string | null;
}

export interface CampaignListItem extends Campaign {
  raisedToDate: number;
  progressPct: number | null;
}

export interface CampaignDetail {
  campaign: Campaign;
  raisedToDate: number;
  donationCount: number;
  progressPct: number | null;
  events: EventRecord[];
}

export interface EventRecord {
  id: string;
  name: string;
  eventType: string | null;
  eventDate: string;
  location: string | null;
  campaignId: string | null;
  description: string | null;
  attendanceCount: number | null;
  revenue: string | number | null;
  expenses: string | number | null;
  notes: string | null;
  campaign?: NamedRef | null;
  _count?: { registrations: number };
}

export type RegistrationStatus = 'registered' | 'attended' | 'no_show' | 'canceled';

export interface EventRegistrationRecord {
  id: string;
  eventId: string;
  personId: string | null;
  externalName: string | null;
  externalEmail: string | null;
  status: RegistrationStatus;
  notes: string | null;
  checkedInAt: string | null;
  createdAt: string;
  person: PersonRef | null;
}

export interface EventDetail {
  event: EventRecord & { campaign: NamedRef | null };
  registrations: EventRegistrationRecord[];
  revenue: number;
  expenses: number;
  net: number;
  donationsLinked: { count: number; total: number };
}

export interface Vendor {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  servicesProvided: string | null;
  isReferralPartner: boolean;
  active: boolean;
  notes: string | null;
}

export interface SyncRun {
  id: string;
  target: string;
  status: 'running' | 'success' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  stats: unknown;
  error: string | null;
}

export interface DonorCrmStatus {
  provider: 'none' | 'bloomerang' | 'neoncrm';
  providerLabel: string;
  configured: boolean;
  latest: SyncRun | null;
}

export interface DonorCrmConfig {
  provider: DonorCrmStatus['provider'];
  settingKey: string;
  providers: {
    key: DonorCrmStatus['provider'];
    label: string;
    envReady: boolean;
    envVars: string[];
  }[];
}
