import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  attachmentListQuerySchema,
  attachmentUploadSchema,
  isAllowedAttachmentType,
  isInlineRenderableType,
  MAX_ATTACHMENT_BYTES,
  type AttachmentListQuery,
  type AttachmentUploadInput,
} from '@jumpstart/shared';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { AttachmentsService, type UploadedAttachmentFile } from './attachments.service';

/**
 * Multipart upload for the required "file" field. No storage option = multer
 * in-memory storage (bytes go straight into the attachments row — drug-test
 * pattern). Oversize files surface as 413 via Nest's MulterError mapping; a
 * disallowed content type is rejected 400 before any bytes are buffered.
 */
const attachmentUpload = () =>
  FileInterceptor('file', {
    limits: { fileSize: MAX_ATTACHMENT_BYTES },
    fileFilter: (
      _req: unknown,
      file: { mimetype?: string },
      cb: (error: Error | null, accept: boolean) => void,
    ) => {
      if (!isAllowedAttachmentType(file.mimetype)) {
        cb(
          new BadRequestException(
            'File type not allowed — images, PDF, Office documents, text and CSV only',
          ),
          false,
        );
        return;
      }
      cb(null, true);
    },
  });

/**
 * Authorization here is DYNAMIC: the required permission derives from the
 * attachment's entityType (participants.*, vehicles.*, volunteers.*,
 * case_management.*), so no single static key fits. The zero-arg
 * @RequirePermission() keeps the route-protection CI scan satisfied and the
 * intent explicit; AttachmentsService.ENTITY_RULES is the one authorization
 * table and every handler below enforces it (same service-level pattern as
 * confidential case notes, §7.3).
 */
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post()
  @RequirePermission() // dynamic: entity write permission, enforced in service
  @UseInterceptors(attachmentUpload())
  create(
    @Body(zodBody(attachmentUploadSchema)) body: AttachmentUploadInput,
    @UploadedFile() file: UploadedAttachmentFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('A file is required');
    return this.attachments.upload(body, file, user);
  }

  @Get()
  @RequirePermission() // dynamic: entity read permission, enforced in service
  list(
    @Query(zodQuery(attachmentListQuerySchema)) query: AttachmentListQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attachments.list(query, user);
  }

  @Get(':id/download')
  @RequirePermission() // dynamic: entity read (+ confidential), enforced in service
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const file = await this.attachments.download(id, user);
    // Stored filenames come from the browser — keep the header quote-safe.
    const safeName = file.filename.replace(/[^\w.\- ]+/g, '_') || 'file';

    /**
     * `file.contentType` is the type SNIFFED FROM THE BYTES at upload, not the
     * string the uploader sent (see AttachmentsService.upload). Echoing the
     * declared type was half of a stored-script hole; the other half was
     * `startsWith('image/')`, which sent `image/svg+xml` down the INLINE path —
     * and an SVG is a document that can carry script.
     *
     * Inline is now an explicit, narrow allowlist (rasters + PDF) and
     * everything else downloads. The two headers are belt and braces on that:
     * nosniff stops a browser second-guessing the type, and the sandbox policy
     * means even a file that does somehow render as a document gets a null
     * origin with no script, so it can reach nothing of this API's.
     */
    const inline = isInlineRenderableType(file.contentType);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox; frame-ancestors 'none'");
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
    );
    res.send(file.data);
  }

  @Delete(':id')
  @RequirePermission() // dynamic: entity write permission, enforced in service
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.attachments.softDelete(id, user);
  }
}
