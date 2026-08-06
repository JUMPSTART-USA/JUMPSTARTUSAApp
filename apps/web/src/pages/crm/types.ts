// Response shapes for the CRM module (apps/api/src/modules/crm). The platform
// is the system of record for donors, giving, campaigns and events (§6.8) —
// money fields arrive as Prisma Decimal strings, computed aggregates as numbers.

import type {
  DonorTaskStatus,
  GiftFrequency,
  InteractionChannel,
  InteractionPurpose,
  PledgeStatus,
  RecurringGiftStatus,
  TributeType,
} from '@jumpstart/shared';

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

/**
 * Person match returned in the 409 body when creating an individual donor who
 * looks like an existing participant/volunteer (§5).
 */
export interface DuplicatePersonCandidate {
  personId: string;
  firstName: string;
  lastName: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  city: string | null;
  state: string | null;
  isParticipant: boolean;
  isVolunteer: boolean;
  existingDonor: NamedRef | null;
}

/** Computed giving lifecycle: prospective (no gifts) → new → active → lapsed → inactive. */
export type DonorLifecycle = 'prospective' | 'new' | 'active' | 'lapsed' | 'inactive';

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
  householdId: string | null;
  isHeadOfHousehold: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DonorListItem extends Donor {
  lifetimeGiving: number;
  lastGiftDate: string | null;
  lifecycle: DonorLifecycle;
  household?: NamedRef | null;
}

export interface Household {
  id: string;
  name: string;
  envelopeName: string | null;
  notes: string | null;
}

export interface HouseholdListItem extends Household {
  memberCount: number;
  householdGiving: number;
}

export interface HouseholdMemberRef {
  id: string;
  name: string;
  isHeadOfHousehold: boolean;
}

export interface DonorHousehold extends Household {
  members: HouseholdMemberRef[];
}

/**
 * Relationship row as the donor detail returns it: already normalized to read
 * from the viewed donor's side (incoming rows arrive relabeled with the
 * reciprocal type and the other party in relatedDonor).
 */
export interface DonorRelationshipRecord {
  id: string;
  direction: 'outgoing' | 'incoming';
  relationshipType: string;
  reciprocalType: string | null;
  notes: string | null;
  relatedDonor: NamedRef;
}

export interface GivingSummary {
  lifetime: number;
  ytd: number;
  firstGiftDate: string | null;
  lastGiftDate: string | null;
  giftCount: number;
  largestGift: number;
  averageGift: number;
  lifecycle: DonorLifecycle;
  softCreditTotal: number;
}

export interface Donation {
  id: string;
  donorId: string;
  donationDate: string;
  amount: string | number;
  paymentMethod: string | null;
  isRecurring: boolean;
  receiptSent: boolean;
  fundId: string | null;
  campaignId: string | null;
  appealId: string | null;
  eventId: string | null;
  pledgeId: string | null;
  recurringGiftId: string | null;
  tributeType: TributeType | null;
  tributeName: string | null;
  tributeNotify: string | null;
  isAnonymous: boolean;
  nonDeductibleAmount: string | number | null;
  inKindDescription: string | null;
  inKindFairMarketValue: string | number | null;
  acknowledgedAt: string | null;
  acknowledgedById: string | null;
  notes: string | null;
  donor?: NamedRef;
  campaign?: NamedRef | null;
  event?: NamedRef | null;
  fund?: NamedRef | null;
  appeal?: NamedRef | null;
}

export interface SoftCreditRecord {
  id: string;
  donationId: string;
  donorId: string;
  amount: string | number;
  notes: string | null;
  donor: NamedRef;
}

export interface DonationDetail extends Donation {
  softCredits: SoftCreditRecord[];
}

/** Soft credit received by a donor, with the underlying gift for context. */
export interface SoftCreditReceived {
  id: string;
  donationId: string;
  amount: string | number;
  notes: string | null;
  donation: {
    id: string;
    donationDate: string;
    amount: string | number;
    donor?: NamedRef;
  };
}

export interface DonationSummary {
  count: number;
  total: number;
  average: number;
}

export interface Pledge {
  id: string;
  donorId: string;
  pledgeDate: string;
  totalAmount: string | number;
  installmentAmount: string | number | null;
  frequency: GiftFrequency | null;
  startDate: string | null;
  endDate: string | null;
  campaignId: string | null;
  fundId: string | null;
  appealId: string | null;
  status: PledgeStatus;
  writtenOffAmount: string | number | null;
  notes: string | null;
  donor?: NamedRef;
  campaign?: NamedRef | null;
  fund?: NamedRef | null;
  appeal?: NamedRef | null;
}

export interface PledgeListItem extends Pledge {
  amountPaid: number;
  balance: number;
  percentPaid: number;
  /** installmentAmount × elapsed periods, capped at total; null without a schedule. */
  expectedToDate: number | null;
  inArrears: boolean;
}

export interface PledgeDetail extends PledgeListItem {
  payments: Donation[];
}

export interface RecurringGift {
  id: string;
  donorId: string;
  amount: string | number;
  frequency: GiftFrequency;
  startDate: string;
  endDate: string | null;
  nextGiftDate: string | null;
  paymentMethod: string | null;
  campaignId: string | null;
  fundId: string | null;
  appealId: string | null;
  status: RecurringGiftStatus;
  notes: string | null;
  donor?: NamedRef;
  campaign?: NamedRef | null;
  fund?: NamedRef | null;
  appeal?: NamedRef | null;
}

export interface RecurringGiftListItem extends RecurringGift {
  lastPaymentDate: string | null;
  paymentCount: number;
  totalGiven: number;
  isOverdue: boolean;
}

export interface RecurringGiftDetail extends RecurringGiftListItem {
  payments: Donation[];
}

export interface DonorInteraction {
  id: string;
  donorId: string;
  date: string;
  channel: InteractionChannel;
  purpose: InteractionPurpose;
  subject: string;
  notes: string | null;
  isInbound: boolean;
  donor?: NamedRef;
}

export interface DonorTask {
  id: string;
  donorId: string;
  assignedToId: string | null;
  subject: string;
  dueDate: string | null;
  status: DonorTaskStatus;
  completedAt: string | null;
  channel: InteractionChannel | null;
  purpose: InteractionPurpose | null;
  notes: string | null;
  donor?: NamedRef;
}

export interface DonorDetail {
  donor: Donor & { person: PersonRef | null; household: DonorHousehold | null };
  relationships: DonorRelationshipRecord[];
  givingSummary: GivingSummary;
  donations: Donation[];
  softCreditsReceived: SoftCreditReceived[];
  pledges: PledgeListItem[];
  recurringGifts: RecurringGiftListItem[];
  interactions: DonorInteraction[];
  openTasks: DonorTask[];
  campaigns: NamedRef[];
  events: NamedRef[];
}

export interface Fund {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface FundListItem extends Fund {
  raisedToDate: number;
  donationCount: number;
}

export interface Appeal {
  id: string;
  name: string;
  description: string | null;
  campaignId: string | null;
  goalAmount: string | number | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  campaign?: NamedRef | null;
}

export interface AppealListItem extends Appeal {
  raisedToDate: number;
  donationCount: number;
  progressPct: number | null;
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
  appeals: AppealListItem[];
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
