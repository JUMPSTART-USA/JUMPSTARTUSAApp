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
  donorType: z.enum(DONOR_TYPES).optional(),
  status: z.enum(['active', 'lapsed', 'inactive']).optional(),
  householdId: uuid.optional(),
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
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { donorType, status, householdId, hasEmail, ...listQuery } = query;
    return this.donors.list(listQuery as ListQuery, { donorType, status, householdId, hasEmail });
  }

  @Get(':id/timeline')
  @RequirePermission('donors.read')
  timeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zodQuery(listQuerySchema)) query: ListQuery,
  ) {
    return this.donors.timeline(id, query);
  }

  @Get(':id')
  @RequirePermission('donors.read')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.donors.detail(id);
  }

  // §5: 409s with person candidates when an individual donor matches an
  // existing participant/volunteer and no personId/confirmNotDuplicate is set.
  @Post()
  @RequirePermission('donors.create')
  create(
    @Body(zodBody(donorCreateSchema)) body: DonorCreateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.donors.create(body, user.id);
  }

  @Patch(':id')
  @RequirePermission('donors.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(donorUpdateSchema)) body: Partial<DonorInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.donors.update(id, body, user.id);
  }

  // Relationship edits are an edit of the donor record — 'donors.update'.
  @Post(':id/relationships')
  @RequirePermission('donors.update')
  addRelationship(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(donorRelationshipSchema)) body: DonorRelationshipInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.donors.addRelationship(id, body, user.id);
  }

  @Delete('relationships/:rid')
  @RequirePermission('donors.update')
  removeRelationship(
    @Param('rid', ParseUUIDPipe) rid: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.donors.removeRelationship(rid, user.id);
  }

  @Delete(':id')
  @RequirePermission('donors.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.donors.softDelete(id, user.id);
  }
}
