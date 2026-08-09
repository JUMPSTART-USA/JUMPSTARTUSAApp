import type { IntakeStatus, ReferrerType } from '@jumpstart/shared';
import { ApiError } from '@/lib/api';

// ── API view shapes (public-intake staff review side, §6.11) ────────────────

/** §5 duplicate matching decorates every queue row so reviewers LINK, not CREATE. */
export interface DuplicateCandidate {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  dateOfBirth: string | null;
  primaryPhone: string | null;
  primaryEmail: string | null;
  city: string | null;
  state: string | null;
  participantProfileId: string | null;
  participantNumber: string | null;
  volunteerProfileId: string | null;
  profileTypes: string[];
}

export interface VolunteerApplicationItem {
  id: string;
  submittedAt: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  /** The submission's CHAPTER (§7.2) — null only on legacy rows. */
  state: string | null;
  interestAreas: string[];
  availability: string | null;
  churchAffiliation: string | null;
  message: string | null;
  consentAt: string | null;
  status: IntakeStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  linkedPersonId: string | null;
  duplicateCandidates: DuplicateCandidate[];
}

export interface ReferralItem {
  id: string;
  submittedAt: string;
  referrerType: ReferrerType;
  referrerName: string | null;
  referrerPhone: string | null;
  referrerEmail: string | null;
  subjectFirstName: string;
  subjectLastName: string;
  subjectPhone: string | null;
  facilityName: string | null;
  /** The referral's CHAPTER (§7.2) — null only on legacy rows. */
  state: string | null;
  expectedReleaseDate: string | null;
  needs: string;
  status: IntakeStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  linkedParticipantProfileId: string | null;
  duplicateCandidates: DuplicateCandidate[];
}

export interface AlumniUpdateItem {
  id: string;
  participantProfileId: string;
  submittedAt: string;
  employmentStatus: string | null;
  housingStatus: string | null;
  newPhone: string | null;
  newEmail: string | null;
  newAddress: string | null;
  message: string | null;
  status: IntakeStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
  participantProfile: {
    id: string;
    participantNumber: string;
    alumniStatus: string;
    /** Chapter of the alum (§7.2) — this update's chapter derives from it. */
    chapterState: string;
    person: {
      id: string;
      firstName: string;
      lastName: string;
      preferredName: string | null;
      primaryPhone: string | null;
      primaryEmail: string | null;
    };
  };
}

interface QueueSummary {
  byStatus: Record<string, number>;
  oldestPendingSubmittedAt: string | null;
  oldestPendingAgeDays: number | null;
}

export interface IntakeSummary {
  volunteerApplications: QueueSummary;
  referrals: QueueSummary;
  alumniUpdates: QueueSummary;
}

export interface ReviewPayload {
  action: 'approve' | 'reject' | 'spam';
  reviewNotes?: string;
  existingPersonId?: string;
  /**
   * Chapter for a legacy submission that arrived before the public forms
   * required one (§7.2). The API rejects the review without it.
   */
  state?: string;
}

// ── Shared helpers ───────────────────────────────────────────────────────────

/** Review SLA (§6.11): submissions waiting more than 3 days are flagged. */
export const SLA_DAYS = 3;

export function ageDays(submittedAt: string): number {
  return Math.floor((Date.now() - new Date(submittedAt).getTime()) / 86_400_000);
}

export function isReviewable(status: IntakeStatus): boolean {
  return status === 'pending' || status === 'in_review';
}

export function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : 'Request failed';
}
