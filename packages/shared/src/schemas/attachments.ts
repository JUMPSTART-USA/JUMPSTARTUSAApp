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
 * Image types an attachment may carry — the SAME list profile photos use, and
 * for the same reason: `image/svg+xml` is excluded because an SVG is a document
 * that can carry script, not a picture.
 *
 * This used to be a `startsWith('image/')` prefix match, which let SVG through.
 * Paired with a download handler that echoed the uploaded content type back and
 * served anything image-shaped INLINE, that was a stored-script hole on the
 * API's own origin — while the profile-photo path four files away had the rule
 * right and said so out loud. A prefix match cannot express "images except the
 * one that is really a document", so it is gone.
 */
export const ATTACHMENT_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'image/heic',
  'image/heif',
]);

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

export const normalizeContentType = (contentType: string) =>
  contentType.split(';')[0]!.trim().toLowerCase();

export function isAllowedAttachmentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  const normalized = normalizeContentType(contentType);
  return ATTACHMENT_IMAGE_TYPES.has(normalized) || ATTACHMENT_EXACT_TYPES.has(normalized);
}

/**
 * Types safe to render INLINE in the browser. Everything else downloads.
 *
 * Deliberately narrower than the upload allowlist: these are formats a browser
 * renders as a picture, plus PDF, which staff genuinely need to preview and
 * which modern browsers open in a sandboxed viewer. Nothing that can execute
 * script in the page's origin belongs here.
 */
export function isInlineRenderableType(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  const normalized = normalizeContentType(contentType);
  return normalized === 'application/pdf' || ATTACHMENT_IMAGE_TYPES.has(normalized);
}

/** For `<input type="file" accept>` — mirrors isAllowedAttachmentType. */
export const ATTACHMENT_ACCEPT = [...ATTACHMENT_IMAGE_TYPES, ...ATTACHMENT_EXACT_TYPES].join(',');

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
