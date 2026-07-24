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
  caseNoteSchema,
  listQuerySchema,
  NOTE_CATEGORIES,
  optionalDate,
  uuid,
  type CaseNoteInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { CaseNotesService } from './case-notes.service';

const listFiltersSchema = listQuerySchema.extend({
  participantProfileId: uuid.optional(),
  category: z.enum(NOTE_CATEGORIES).optional(),
  from: optionalDate,
  to: optionalDate,
});
type ListFilters = z.infer<typeof listFiltersSchema>;

// caseNoteSchema is a ZodEffects (superRefine) — partial() lives on its inner
// object; the cross-field follow-up rule is re-checked in the service.
const caseNoteUpdateSchema = caseNoteSchema.innerType().partial();

@Controller('case-notes')
export class CaseNotesController {
  constructor(private readonly notes: CaseNotesService) {}

  @Get()
  @RequirePermission('case_management.read')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters, @CurrentUser() user: AuthenticatedUser) {
    const { participantProfileId, category, from, to, ...listQuery } = query;
    return this.notes.list(listQuery as ListQuery, { participantProfileId, category, from, to }, user);
  }

  @Get(':id')
  @RequirePermission('case_management.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.notes.get(id, user);
  }

  @Post()
  @RequirePermission('case_management.create')
  create(
    @Body(zodBody(caseNoteSchema)) body: CaseNoteInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notes.create(body, user.id);
  }

  @Post(':id/complete-follow-up')
  @RequirePermission('case_management.update')
  completeFollowUp(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.notes.completeFollowUp(id, user.id);
  }

  @Patch(':id')
  @RequirePermission('case_management.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(caseNoteUpdateSchema)) body: Partial<CaseNoteInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notes.update(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('case_management.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.notes.softDelete(id, user);
  }
}
