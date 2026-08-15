import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { isAllowedProfilePhotoType, MAX_PROFILE_PHOTO_BYTES } from '@jumpstart/shared';
import { detectContentType } from './file-signature.util';

/**
 * Profile photos (participants, volunteers, donors) — one multer config and
 * one streaming response shared by the three photo endpoints, mirroring the
 * drug-test photo contract: bytes live on the entity row, the photo GET is
 * the only reader, a new upload replaces the stored one.
 */

/** Matches multer's file shape (@types/multer isn't installed workspace-wide). */
export interface UploadedPhotoFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

/**
 * Multipart upload for the required "photo" field. No storage option = multer
 * in-memory storage (the bytes go straight into the row). Oversize files
 * surface as 413 via Nest's MulterError mapping; a disallowed content type is
 * rejected 400 by the filter before any bytes are buffered.
 */
export const profilePhotoUpload = () =>
  FileInterceptor('photo', {
    limits: { fileSize: MAX_PROFILE_PHOTO_BYTES },
    fileFilter: (
      _req: unknown,
      file: { mimetype?: string },
      cb: (error: Error | null, accept: boolean) => void,
    ) => {
      if (!isAllowedProfilePhotoType(file.mimetype)) {
        cb(
          new BadRequestException('Photo must be an image (jpeg, png, gif, webp, heic, tiff, bmp)'),
          false,
        );
        return;
      }
      cb(null, true);
    },
  });

export interface StoredPhoto {
  data: Buffer;
  mimeType: string;
  fileName: string;
}

/**
 * Streams stored photo bytes inline. Filenames come from browsers — quote-safe.
 *
 * The stored mime type is the one SNIFFED FROM THE BYTES on upload (see
 * photoColumns), so what is served always describes what is actually there.
 * The extra headers are belt and braces on that: nosniff stops a browser
 * second-guessing the type, and the sandbox policy gives anything that does
 * manage to render as a document a null origin with no script.
 */
export function sendPhoto(res: Response, photo: StoredPhoto): void {
  const safeName = photo.fileName.replace(/[^\w.\- ]+/g, '_') || 'photo';
  res.setHeader('Content-Type', photo.mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox; frame-ancestors 'none'");
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  res.send(photo.data);
}

/**
 * The three photo columns, ready to spread into a Prisma update.
 *
 * Stores the type the BYTES report, not the one the uploader declared. The
 * multer filter only ever saw a client-supplied string, and these photos are
 * served back INLINE — so without this, whoever uploaded chose how the file
 * would later be interpreted in a staff member's browser.
 *
 * Throws when the two disagree: unlike attachments, every accepted photo
 * format is self-describing, so "no signature" here means "not a photo".
 */
export function photoColumns(photo: UploadedPhotoFile) {
  const detected = detectContentType(photo.buffer);
  if (!detected || !isAllowedProfilePhotoType(detected)) {
    throw new BadRequestException(
      'That file’s contents are not a photo — re-save it as JPEG or PNG and try again',
    );
  }
  return {
    // Copy into a fresh Uint8Array: Prisma's Bytes input is typed
    // Uint8Array<ArrayBuffer>, while Buffer is Uint8Array<ArrayBufferLike>.
    photoData: new Uint8Array(photo.buffer),
    photoMimeType: detected,
    photoFileName: photo.originalname,
  };
}

/** Spread into a Prisma update to remove a stored photo. */
export const CLEAR_PHOTO_COLUMNS = {
  photoData: null,
  photoMimeType: null,
  photoFileName: null,
} as const;
