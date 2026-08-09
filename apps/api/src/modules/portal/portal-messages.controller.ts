import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import {
  CHAPTER_STATES,
  PORTAL_MESSAGE_STATUSES,
  listQuerySchema,
  optionalTrimmed,
  uuid,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import {
  PortalMessagesService,
  type PortalMessageReviewInput,
} from './portal-messages.service';

// Message review is API-only shape (no public form runs it), so the schema
// lives here rather than in @jumpstart/shared.
const portalMessageReviewSchema = z.object({
  status: z.enum(PORTAL_MESSAGE_STATUSES),
  staffNotes: optionalTrimmed.pipe(z.string().max(5000).optional()),
});

const listFiltersSchema = listQuerySchema.extend({
  participantProfileId: uuid.optional(),
  status: z.enum(PORTAL_MESSAGE_STATUSES).optional(),
  state: z.enum(CHAPTER_STATES).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('portal-messages')
export class PortalMessagesController {
  constructor(private readonly messages: PortalMessagesService) {}

  @Get()
  @RequirePermission('case_management.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { participantProfileId, status, state, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.messages.list(listQuery as ListQuery, {
      participantProfileId,
      status,
      state: user.chapter ?? state,
    });
  }

  @Patch(':id')
  @RequirePermission('case_management.update')
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(portalMessageReviewSchema)) body: PortalMessageReviewInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.messages.review(id, body, user);
  }
}
