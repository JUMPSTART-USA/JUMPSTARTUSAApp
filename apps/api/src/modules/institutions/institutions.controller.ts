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
  institutionContactSchema,
  institutionSchema,
  listQuerySchema,
  US_STATES,
  type InstitutionContactInput,
  type InstitutionInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { InstitutionsService } from './institutions.service';

const listFiltersSchema = listQuerySchema.extend({
  state: z.enum(US_STATES).optional(),
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly institutions: InstitutionsService) {}

  @Get()
  @RequirePermission('institutions.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { state, active, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.institutions.list(listQuery as ListQuery, {
      state: (user.chapter ?? state) as ListFilters['state'],
      active,
    });
  }

  @Get(':id')
  @RequirePermission('institutions.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.institutions.get(id, user);
  }

  @Get(':id/profile')
  @RequirePermission('institutions.read')
  profile(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.institutions.profile(id, user);
  }

  @Post()
  @RequirePermission('institutions.create')
  create(
    @Body(zodBody(institutionSchema)) body: InstitutionInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutions.create(body, user);
  }

  @Patch(':id')
  @RequirePermission('institutions.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(institutionSchema.partial())) body: Partial<InstitutionInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutions.update(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('institutions.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.institutions.softDelete(id, user);
  }

  // ── Contacts (chaplains, wardens, coordinators… — no limit) ────────────────

  @Get(':id/contacts')
  @RequirePermission('institutions.read')
  listContacts(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.institutions.listContacts(id, user);
  }

  @Post(':id/contacts')
  @RequirePermission('institutions.update')
  createContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(institutionContactSchema)) body: InstitutionContactInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutions.createContact(id, body, user);
  }

  @Patch(':id/contacts/:contactId')
  @RequirePermission('institutions.update')
  updateContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body(zodBody(institutionContactSchema)) body: InstitutionContactInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutions.updateContact(id, contactId, body, user);
  }

  @Delete(':id/contacts/:contactId')
  @RequirePermission('institutions.update')
  deleteContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.institutions.deleteContact(id, contactId, user);
  }
}
