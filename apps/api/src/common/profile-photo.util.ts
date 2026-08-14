import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { isAllowedProfilePhotoType, MAX_PROFILE_PHOTO_BYTES } from '@jumpstart/shared';

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

/** Streams stored photo bytes inline. Filenames come from browsers — quote-safe. */
export function sendPhoto(res: Response, photo: StoredPhoto): void {
  const safeName = photo.fileName.replace(/[^\w.\- ]+/g, '_') || 'photo';
  res.setHeader('Content-Type', photo.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  res.send(photo.data);
}

/** The three photo columns, ready to spread into a Prisma update. */
export function photoColumns(photo: UploadedPhotoFile) {
  return {
    // Copy into a fresh Uint8Array: Prisma's Bytes input is typed
    // Uint8Array<ArrayBuffer>, while Buffer is Uint8Array<ArrayBufferLike>.
    photoData: new Uint8Array(photo.buffer),
    photoMimeType: photo.mimetype,
    photoFileName: photo.originalname,
  };
}

/** Spread into a Prisma update to remove a stored photo. */
export const CLEAR_PHOTO_COLUMNS = {
  photoData: null,
  photoMimeType: null,
  photoFileName: null,
} as const;
