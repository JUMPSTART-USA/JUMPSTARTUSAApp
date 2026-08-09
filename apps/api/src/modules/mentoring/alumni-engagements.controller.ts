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
  alumniEngagementSchema,
  CHAPTER_STATES,
  ENGAGEMENT_TYPES,
  listQuerySchema,
  optionalDate,
  uuid,
  type AlumniEngagementInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { AlumniEngagementsService } from './alumni-engagements.service';

const listFiltersSchema = listQuerySchema.extend({
  participantProfileId: uuid.optional(),
  engagementType: z.enum(ENGAGEMENT_TYPES).optional(),
  from: optionalDate,
  to: optionalDate,
  state: z.enum(CHAPTER_STATES).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

// Engagements are corrected in place, never moved to another participant.
const updateSchema = alumniEngagementSchema.omit({ participantProfileId: true }).partial();
type UpdateInput = z.infer<typeof updateSchema>;

@Controller('alumni-engagements')
export class AlumniEngagementsController {
  constructor(private readonly engagements: AlumniEngagementsService) {}

  @Get()
  @RequirePermission('alumni.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { participantProfileId, engagementType, from, to, state, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.engagements.list(listQuery as ListQuery, {
      participantProfileId,
      engagementType,
      from,
      to,
      state: user.chapter ?? state,
    });
  }

  @Get(':id')
  @RequirePermission('alumni.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.engagements.get(id, user);
  }

  @Post()
  @RequirePermission('alumni.create')
  create(
    @Body(zodBody(alumniEngagementSchema)) body: AlumniEngagementInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.engagements.create(body, user);
  }

  @Patch(':id')
  @RequirePermission('alumni.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateSchema)) body: UpdateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.engagements.update(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('alumni.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.engagements.remove(id, user);
  }
}
