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
  eventRegistrationSchema,
  eventSchema,
  listQuerySchema,
  optionalDate,
  type EventInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import {
  EventsService,
  type RegistrationCreate,
  type RegistrationUpdate,
} from './events.service';

const listFiltersSchema = listQuerySchema.extend({
  eventType: z.string().trim().max(100).optional(),
  campaignId: z.string().uuid().optional(),
  from: optionalDate,
  to: optionalDate,
});
type ListFilters = z.infer<typeof listFiltersSchema>;

// eventId comes from the route; the schema's person-or-guest refinement is a
// superRefine on the full object, so the service re-enforces it.
const registrationCreateSchema = eventRegistrationSchema.innerType().omit({ eventId: true });
const registrationUpdateSchema = registrationCreateSchema.partial();

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @RequirePermission('events.read')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { eventType, campaignId, from, to, ...listQuery } = query;
    return this.events.list(listQuery as ListQuery, { eventType, campaignId, from, to });
  }

  @Get(':id')
  @RequirePermission('events.read')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.events.detail(id);
  }

  @Get(':id/financial-summary')
  @RequirePermission('events.read')
  financialSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.events.financialSummary(id);
  }

  @Post()
  @RequirePermission('events.create')
  create(
    @Body(zodBody(eventSchema)) body: EventInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.events.create(body, user.id);
  }

  @Patch(':id')
  @RequirePermission('events.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(eventSchema.partial())) body: Partial<EventInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.events.update(id, body, user.id);
  }

  @Delete(':id')
  @RequirePermission('events.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.events.softDelete(id, user.id);
  }

  // Roster changes are an edit of the event, so 'events.update' rather than
  // 'events.create' — check-in staff hold update.
  @Post(':id/registrations')
  @RequirePermission('events.update')
  addRegistration(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(registrationCreateSchema)) body: RegistrationCreate,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.events.addRegistration(id, body, user.id);
  }
}

@Controller('registrations')
export class EventRegistrationsController {
  constructor(private readonly events: EventsService) {}

  @Patch(':id')
  @RequirePermission('events.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(registrationUpdateSchema)) body: RegistrationUpdate,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.events.updateRegistration(id, body, user.id);
  }
}
