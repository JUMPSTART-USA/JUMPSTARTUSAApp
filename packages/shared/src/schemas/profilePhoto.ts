/**
 * Profile photos (participants, volunteers, donors) — stored inline on the
 * entity row, same pattern as drug-test photos. Constants shared by the API's
 * multer fileFilter and the SPA's pre-check, like attachments.ts.
 */

/** Hard upload cap — enforced by multer server-side and pre-checked in the SPA. */
export const MAX_PROFILE_PHOTO_BYTES = 10 * 1024 * 1024;

/**
 * All major image formats. SVG is deliberately excluded — it can carry
 * scripts, and photos never arrive as SVG. HEIC/HEIF are iPhone camera
 * formats; browsers other than Safari may not render them, but refusing the
 * upload would be worse than a best-effort preview.
 */
const PROFILE_PHOTO_TYPES = new Set([
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

export function isAllowedProfilePhotoType(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  return PROFILE_PHOTO_TYPES.has(contentType.split(';')[0]!.trim().toLowerCase());
}

/** For `<input type="file" accept>` — mirrors isAllowedProfilePhotoType. */
export const PROFILE_PHOTO_ACCEPT = [...PROFILE_PHOTO_TYPES].join(',');
