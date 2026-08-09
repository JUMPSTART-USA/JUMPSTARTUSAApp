import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { uuid } from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { PortalTokensService } from './portal-tokens.service';

const listTokensQuerySchema = z.object({ participantProfileId: uuid });
const issueTokenSchema = z.object({ participantProfileId: uuid });

/**
 * Staff management of participant portal links. Guarded by the participants
 * module permissions — the token lives on the participant profile page, not
 * in the case-management queues.
 */
@Controller('portal-tokens')
export class PortalTokensController {
  constructor(private readonly tokens: PortalTokensService) {}

  @Get()
  @RequirePermission('participants.read')
  list(
    @Query(zodQuery(listTokensQuerySchema)) query: z.infer<typeof listTokensQuerySchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tokens.list(query.participantProfileId, user);
  }

  @Post()
  @RequirePermission('participants.update')
  issue(
    @Body(zodBody(issueTokenSchema)) body: z.infer<typeof issueTokenSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tokens.issue(body.participantProfileId, user);
  }

  @Post(':id/revoke')
  @RequirePermission('participants.update')
  revoke(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tokens.revoke(id, user);
  }
}
