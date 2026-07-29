import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  supportMessageSchema,
  supportStatusSchema,
  supportTicketSchema,
  TICKET_STATUSES,
  type SupportMessageInput,
  type SupportStatusInput,
  type SupportTicketInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { SupportService } from './support.service';

const listAllQuerySchema = z.object({ status: z.enum(TICKET_STATUSES).optional() });
type ListAllQuery = z.infer<typeof listAllQuerySchema>;

/**
 * Support tickets: support.access is held by EVERY role, so the page is
 * effectively universal; ownership and the administrators-only rules are
 * enforced in the service.
 */
@Controller('support/tickets')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  @RequirePermission('support.access')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.support.listMine(user);
  }

  @Get('all')
  @RequirePermission('support.access')
  listAll(
    @Query(zodQuery(listAllQuerySchema)) query: ListAllQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.support.listAll(user, query.status);
  }

  @Post()
  @RequirePermission('support.access')
  create(
    @Body(zodBody(supportTicketSchema)) body: SupportTicketInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.support.create(body, user);
  }

  @Get(':id')
  @RequirePermission('support.access')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.support.detail(id, user);
  }

  @Post(':id/messages')
  @RequirePermission('support.access')
  addMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(supportMessageSchema)) body: SupportMessageInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.support.addMessage(id, body, user);
  }

  @Patch(':id/status')
  @RequirePermission('support.access')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(supportStatusSchema)) body: SupportStatusInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.support.setStatus(id, body.status, user);
  }
}
