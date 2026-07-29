import type { ContactType, NoteCategory, TaskStatus } from '@jumpstart/shared';

// ── Response shapes (JSON-serialized Prisma rows from the case-management API) ─

export interface PersonName {
  firstName: string;
  lastName: string;
}

export interface FollowUpItem {
  kind: 'task' | 'note_follow_up';
  id: string;
  title: string;
  dueDate: string | null;
  participantProfileId: string | null;
  participantName: string | null;
  status?: TaskStatus;
  category?: NoteCategory;
}

export interface FollowUpQueue {
  overdue: FollowUpItem[];
  today: FollowUpItem[];
  upcoming: FollowUpItem[];
}

/**
 * List/detail rows for case notes. Confidential notes the viewer may not read
 * arrive as a dated stub (§7.3) — only id/noteDate/category/caseManagerName
 * plus content '[Confidential note]'. The optional fields below are absent on
 * stubs, which is how the UI detects them.
 */
export interface CaseNoteRow {
  id: string;
  noteDate: string;
  category: NoteCategory;
  confidential: boolean;
  content: string;
  caseManagerName: string;
  contactType?: ContactType;
  participantProfileId?: string;
  participantName?: string | null;
  followUpRequired?: boolean;
  followUpDate?: string | null;
  followUpDoneAt?: string | null;
  createdAt?: string;
}

export function isConfidentialStub(note: CaseNoteRow): boolean {
  return note.confidential && note.contactType === undefined;
}

export interface CaseServiceRow {
  id: string;
  participantProfileId: string;
  serviceType: string;
  serviceDate: string;
  providerName: string | null;
  description: string | null;
  outcome: string | null;
  followUpRequired: boolean;
  followUpDate: string | null;
  notes: string | null;
  participantProfile: { person: PersonName };
}

export interface CaseTaskRow {
  id: string;
  title: string;
  details: string | null;
  assignedToId: string;
  dueDate: string | null;
  status: TaskStatus;
  participantProfileId: string | null;
  goalId: string | null;
  outboundReferralId: string | null;
  assignedTo: PersonName;
  participantProfile: { person: PersonName } | null;
}

export interface ReferralRow {
  id: string;
  participantProfileId: string;
  vendorId: string | null;
  providerName: string | null;
  reason: string;
  referralDate: string;
  outcome: string | null;
  notes: string | null;
  vendor: { name: string } | null;
  participantProfile: { person: PersonName };
}

export interface MilestoneRow {
  id: string;
  goalId: string;
  description: string;
  dueDate: string | null;
  completedAt: string | null;
}

export interface GoalRow {
  id: string;
  servicePlanId: string;
  category: NoteCategory;
  description: string;
  targetDate: string | null;
  status: string;
  notes: string | null;
  milestones: MilestoneRow[];
}

export interface ServicePlanRow {
  id: string;
  participantProfileId: string;
  title: string;
  status: 'active' | 'completed' | 'archived';
  reviewDate: string | null;
  notes: string | null;
  participantProfile: { person: PersonName };
  _count?: { goals: number };
}

export interface ServicePlanDetail extends Omit<ServicePlanRow, '_count'> {
  goals: GoalRow[];
}

export interface NeedsAssessmentRow {
  id: string;
  participantProfileId: string;
  instrumentName: string;
  administeredAt: string;
  administeredByName: string | null;
  domainScores: Record<string, number> | null;
  summary: string | null;
  participantProfile: { person: PersonName };
}

export interface ChecklistItemRow {
  id: string;
  label: string;
  sortOrder: number;
  required: boolean;
  status: 'pending' | 'in_progress' | 'completed' | 'not_applicable';
  notes: string | null;
  completedAt: string | null;
}

export interface ChecklistRow {
  id: string;
  participantProfileId: string;
  startedAt: string;
  completedAt: string | null;
  template: { name: string } | null;
  participantProfile: { person: PersonName };
  items: ChecklistItemRow[];
}

export interface CaseloadSummaryRow {
  caseManagerId: string;
  caseManagerName: string;
  activeParticipants: number;
  notesLast7Days: number;
  overdueFollowUps: number;
  participantsNoContact30Days: number;
}
