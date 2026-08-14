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
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CHAPTER_STATES,
  listQuerySchema,
  uuid,
  VOLUNTEER_STATUSES,
  volunteerCreateSchema,
  volunteerUpdateSchema,
  type ListQuery,
  type VolunteerCreateInput,
  type VolunteerUpdateInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import {
  profilePhotoUpload,
  sendPhoto,
  type UploadedPhotoFile,
} from '../../common/profile-photo.util';
import { hasPerm, type AuthenticatedUser } from '../../common/types';
import { ScreeningService } from './screening.service';
import { VolunteersService } from './volunteers.service';

const listFiltersSchema = listQuerySchema.extend({
  /**
   * Narrow to a single record, so a picker can turn an id from a URL back into a
   * name (`?id=<uuid>&pageSize=1`). It runs through the list's own where clause,
   * chapter clause included, so an id the viewer may not see returns an empty
   * page rather than the 404 that `GET /volunteers/:id` would — see the
   * participants controller for the full reasoning.
   */
  id: uuid.optional(),
  /** The PERSON behind the profile — see the participants controller. */
  personId: uuid.optional(),
  status: z.enum(VOLUNTEER_STATUSES).optional(),
  isMentor: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  state: z.enum(CHAPTER_STATES).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

const eligibilityQuerySchema = z.object({ institutionId: uuid });

// §6.6 dashboard windows are fixed at 30/60/90 days.
const expirationsQuerySchema = z.object({
  days: z.enum(['30', '60', '90']).default('30').transform(Number),
});

const canReadChecks = (user: AuthenticatedUser) =>
  hasPerm(user, 'fields.background_checks.read');

@Controller('volunteers')
export class VolunteersController {
  constructor(
    private readonly volunteers: VolunteersService,
    private readonly screening: ScreeningService,
  ) {}

  @Get()
  @RequirePermission('volunteers.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { id, personId, status, isMentor, state, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.volunteers.list(
      listQuery as ListQuery,
      { id, personId, status, isMentor, state: (user.chapter ?? state) as ListFilters['state'] },
      canReadChecks(user),
    );
  }

  // Static path — must be declared before the ':id' routes below.
  @Get('expirations')
  @RequirePermission('volunteers.read')
  expirations(
    @Query(zodQuery(expirationsQuerySchema)) query: { days: number },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Chapter scoping (§7.2): scoped users only see their chapter's expirations.
    return this.screening.expirations(query.days, canReadChecks(user), user.chapter);
  }

  @Get(':id')
  @RequirePermission('volunteers.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.volunteers.get(id, user, canReadChecks(user));
  }

  @Get(':id/eligibility')
  @RequirePermission('volunteers.read')
  eligibility(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zodQuery(eligibilityQuerySchema)) query: { institutionId: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.screening.computeEligibility(id, query.institutionId, user);
  }

  @Get(':id/service-history')
  @RequirePermission('volunteers.read')
  serviceHistory(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.volunteers.serviceHistory(id, user);
  }

  @Post()
  @RequirePermission('volunteers.create')
  create(
    @Body(zodBody(volunteerCreateSchema)) body: VolunteerCreateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.volunteers.create(body, user);
  }

  @Patch(':id')
  @RequirePermission('volunteers.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(volunteerUpdateSchema)) body: VolunteerUpdateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.volunteers.update(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('volunteers.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.volunteers.softDelete(id, user);
  }

  // ── Profile photo ──────────────────────────────────────────────────────────

  @Put(':id/photo')
  @RequirePermission('volunteers.update')
  @UseInterceptors(profilePhotoUpload())
  setPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() photo: UploadedPhotoFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!photo) throw new BadRequestException('Attach the photo as the "photo" field');
    return this.volunteers.setPhoto(id, photo, user);
  }

  @Get(':id/photo')
  @RequirePermission('volunteers.read')
  async getPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    sendPhoto(res, await this.volunteers.getPhoto(id, user));
  }

  @Delete(':id/photo')
  @RequirePermission('volunteers.update')
  clearPhoto(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.volunteers.clearPhoto(id, user);
  }
}
