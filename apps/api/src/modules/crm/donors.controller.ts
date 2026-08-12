import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CHAPTER_STATES,
  donorCreateSchema,
  donorRelationshipSchema,
  donorSchema,
  DONOR_TYPES,
  listQuerySchema,
  uuid,
  type DonorCreateInput,
  type DonorInput,
  type DonorRelationshipInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { DonorsService } from './donors.service';

const listFiltersSchema = listQuerySchema.extend({
  /**
   * Narrow to a single record, so a picker can turn an id from a URL back into a
   * name (`?id=<uuid>&pageSize=1`). It runs through the list's own where clause,
   * chapter clause included, so an id the viewer may not see returns an empty
   * page rather than the 404 that `GET /donors/:id` would — see the participants
   * controller for the full reasoning.
   */
  id: uuid.optional(),
  donorType: z.enum(DONOR_TYPES).optional(),
  status: z.enum(['active', 'lapsed', 'inactive']).optional(),
  householdId: uuid.optional(),
  state: z.enum(CHAPTER_STATES).optional(),
  hasEmail: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

const donorUpdateSchema = donorSchema.partial();

@Controller('donors')
export class DonorsController {
  constructor(private readonly donors: DonorsService) {}

  @Get()
  @RequirePermission('donors.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { id, donorType, status, householdId, state, hasEmail, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.donors.list(listQuery as ListQuery, {
      id,
      donorType,
      status,
      householdId,
      state: (user.chapter ?? state) as ListFilters['state'],
      hasEmail,
    });
  }

  @Get(':id/timeline')
  @RequirePermission('donors.read')
  timeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zodQuery(listQuerySchema)) query: ListQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.donors.timeline(id, query, user);
  }

  @Get(':id')
  @RequirePermission('donors.read')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.donors.detail(id, user);
  }

  // §5: 409s with person candidates when an individual donor matches an
  // existing participant/volunteer and no personId/confirmNotDuplicate is set.
  @Post()
  @RequirePermission('donors.create')
  create(
    @Body(zodBody(donorCreateSchema)) body: DonorCreateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.donors.create(body, user);
  }

  @Patch(':id')
  @RequirePermission('donors.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(donorUpdateSchema)) body: Partial<DonorInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.donors.update(id, body, user);
  }

  // Relationship edits are an edit of the donor record — 'donors.update'.
  @Post(':id/relationships')
  @RequirePermission('donors.update')
  addRelationship(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(donorRelationshipSchema)) body: DonorRelationshipInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.donors.addRelationship(id, body, user);
  }

  @Delete('relationships/:rid')
  @RequirePermission('donors.update')
  removeRelationship(
    @Param('rid', ParseUUIDPipe) rid: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.donors.removeRelationship(rid, user);
  }

  @Delete(':id')
  @RequirePermission('donors.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.donors.softDelete(id, user);
  }
}
