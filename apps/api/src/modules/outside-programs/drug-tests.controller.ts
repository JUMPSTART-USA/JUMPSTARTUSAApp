import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { drugTestSchema, uuid } from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import {
  DrugTestsService,
  type DrugTestCreateInput,
  type DrugTestUpdateInput,
  type UploadedPhotoFile,
} from './drug-tests.service';

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

// drugTestSchema is ZodEffects (not-in-the-future refinement), so extensions/
// partials come from innerType() — same pattern as the program schemas above —
// with the refinement re-applied so it still runs on provided testDates.
const notFutureTestDate = (val: { testDate?: Date }, ctx: z.RefinementCtx) => {
  if (val.testDate && val.testDate > new Date()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Test date cannot be in the future',
      path: ['testDate'],
    });
  }
};
// Multipart fields arrive as strings; the shared primitives coerce
// (requiredDate = z.coerce.date(), optionalTrimmed handles '' → undefined).
const drugTestCreateSchema = drugTestSchema
  .innerType()
  .extend({ participantProfileId: uuid })
  .superRefine(notFutureTestDate);
const drugTestUpdateSchema = drugTestSchema
  .innerType()
  .extend({ participantProfileId: uuid })
  .partial()
  .superRefine(notFutureTestDate);
const drugTestListQuerySchema = z.object({ participantProfileId: uuid });
type DrugTestListQuery = z.infer<typeof drugTestListQuerySchema>;

/**
 * Multipart upload for the optional "photo" field. No storage option = multer
 * in-memory storage (the bytes go straight into the drug_tests row). Oversize
 * files surface as 413 via Nest's MulterError mapping; a non-image mimetype is
 * rejected 400 by the filter before any bytes are buffered.
 */
const photoUpload = () =>
  FileInterceptor('photo', {
    limits: { fileSize: MAX_PHOTO_BYTES },
    fileFilter: (
      _req: unknown,
      file: { mimetype?: string },
      cb: (error: Error | null, accept: boolean) => void,
    ) => {
      if (!file.mimetype || !file.mimetype.startsWith('image/')) {
        cb(new BadRequestException('Photo must be an image (jpeg, png, webp, heic, gif)'), false);
        return;
      }
      cb(null, true);
    },
  });

@Controller('drug-tests')
export class DrugTestsController {
  constructor(private readonly drugTests: DrugTestsService) {}

  @Get()
  @RequirePermission('outside_programs.read')
  list(@Query(zodQuery(drugTestListQuerySchema)) query: DrugTestListQuery) {
    return this.drugTests.list(query.participantProfileId);
  }

  @Post()
  @RequirePermission('outside_programs.create')
  @UseInterceptors(photoUpload())
  create(
    @Body(zodBody(drugTestCreateSchema)) body: DrugTestCreateInput,
    @UploadedFile() photo: UploadedPhotoFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.drugTests.create(body, photo, user.id);
  }

  @Patch(':id')
  @RequirePermission('outside_programs.update')
  @UseInterceptors(photoUpload())
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(drugTestUpdateSchema)) body: DrugTestUpdateInput,
    @UploadedFile() photo: UploadedPhotoFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.drugTests.update(id, body, photo, user.id);
  }

  @Delete(':id')
  @RequirePermission('outside_programs.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.drugTests.softDelete(id, user.id);
  }

  @Get(':id/photo')
  @RequirePermission('outside_programs.read')
  async photo(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const photo = await this.drugTests.getPhoto(id);
    // Stored filenames come from the browser — keep the header quote-safe.
    const safeName = photo.fileName.replace(/[^\w.\- ]+/g, '_') || 'photo';
    res.setHeader('Content-Type', photo.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.send(photo.data);
  }
}
