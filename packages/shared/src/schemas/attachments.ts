import { z } from 'zod';
import { ATTACHMENT_SENSITIVITIES, type AttachmentSensitivity } from '../enums';
import { uuid } from './common';

/**
 * Entities that can carry attachments. Each key maps to a permission pair and
 * an existence check in the API's AttachmentsService — adding a surface means
 * adding a value here AND a row in that service's ENTITY_RULES table.
 */
export const ATTACHMENT_ENTITY_TYPES = [
  'participant_profile',
  'case_note',
  'vehicle_maintenance_record',
  'volunteer_training',
  'volunteer_clearance',
] as const;
export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

export const ATTACHMENT_SENSITIVITY_LABELS: Record<AttachmentSensitivity, string> = {
  standard: 'Standard',
  sensitive: 'Sensitive',
  confidential: 'Confidential',
};

/** Hard upload cap — enforced by multer server-side and pre-checked in the SPA. */
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

/**
 * Content-type allowlist: images, PDF, Office documents, plain text and CSV.
 * One predicate shared by the API's multer fileFilter and the SPA's pre-check.
 */
const ATTACHMENT_EXACT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
]);

export function isAllowedAttachmentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  const normalized = contentType.split(';')[0]!.trim().toLowerCase();
  return normalized.startsWith('image/') || ATTACHMENT_EXACT_TYPES.has(normalized);
}

/** For `<input type="file" accept>` — mirrors isAllowedAttachmentType. */
export const ATTACHMENT_ACCEPT = ['image/*', ...ATTACHMENT_EXACT_TYPES].join(',');

/** Optional display-name override; defaults to the uploaded file's own name. */
const optionalFilename = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().trim().min(1).max(255).optional(),
);

/** Multipart fields arrive as strings — everything here coerces from string. */
export const attachmentUploadSchema = z.object({
  entityType: z.enum(ATTACHMENT_ENTITY_TYPES),
  entityId: uuid,
  sensitivity: z.enum(ATTACHMENT_SENSITIVITIES).default('standard'),
  filename: optionalFilename,
});
export type AttachmentUploadInput = z.infer<typeof attachmentUploadSchema>;

export const attachmentListQuerySchema = z.object({
  entityType: z.enum(ATTACHMENT_ENTITY_TYPES),
  entityId: uuid,
});
export type AttachmentListQuery = z.infer<typeof attachmentListQuerySchema>;
