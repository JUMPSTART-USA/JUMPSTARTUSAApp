import type {
  AlumniStatus,
  CommChannel,
  CommStatus,
  UsState,
  VolunteerStatus,
} from '@jumpstart/shared';

/** Row shape returned by GET /communications (see CommunicationsService.list). */
export interface CommunicationRow {
  id: string;
  personId: string;
  channel: CommChannel;
  templateId: string | null;
  batchId: string | null;
  subject: string | null;
  body: string;
  status: CommStatus;
  statusDetail: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  sentAt: string | null;
  createdAt: string;
  person: { id: string; firstName: string; lastName: string; preferredName: string | null };
  template: { id: string; name: string } | null;
  batch: { id: string; name: string } | null;
}

/** Row shape returned by GET /communications/templates. */
export interface TemplateRow {
  id: string;
  name: string;
  channel: CommChannel;
  subject: string | null;
  body: string;
  active: boolean;
}

/** CommunicationBatch.status is a plain string column: draft | queued | sent. */
export type BatchStatus = 'draft' | 'queued' | 'sent';

/** Row shape returned by GET /communications/batches (see BatchesService.list). */
export interface BatchRow {
  id: string;
  name: string;
  channel: CommChannel;
  audienceFilter: {
    alumniStatus?: AlumniStatus;
    volunteerStatus?: VolunteerStatus;
    state?: UsState;
  } | null;
  status: BatchStatus;
  sentAt: string | null;
  createdAt: string;
  _count: { communications: number };
}

/**
 * POST /communications/batches result. The service currently nests the counts
 * (`{ batch, counts: { matched, queued, suppressed } }`); the flat variant is
 * tolerated in case the API lands on the flatter contract shape.
 */
export interface BatchCreateResult {
  batch: BatchRow;
  counts?: { matched: number; queued: number; suppressed: number };
  matched?: number;
  queued?: number;
  suppressed?: number;
}
