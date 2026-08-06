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
  donorInteractionSchema,
  INTERACTION_CHANNELS,
  INTERACTION_PURPOSES,
  listQuerySchema,
  optionalDate,
  uuid,
  type DonorInteractionInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { InteractionsService } from './interactions.service';

const listFiltersSchema = listQuerySchema.extend({
  donorId: uuid.optional(),
  channel: z.enum(INTERACTION_CHANNELS).optional(),
  purpose: z.enum(INTERACTION_PURPOSES).optional(),
  from: optionalDate,
  to: optionalDate,
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('donor-interactions')
export class InteractionsController {
  constructor(private readonly interactions: InteractionsService) {}

  @Get()
  @RequirePermission('donors.read')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { donorId, channel, purpose, from, to, ...listQuery } = query;
    return this.interactions.list(listQuery as ListQuery, { donorId, channel, purpose, from, to });
  }

  @Post()
  @RequirePermission('donors.create')
  create(
    @Body(zodBody(donorInteractionSchema)) body: DonorInteractionInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.interactions.create(body, user.id);
  }

  @Patch(':id')
  @RequirePermission('donors.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(donorInteractionSchema.partial())) body: Partial<DonorInteractionInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.interactions.update(id, body, user.id);
  }

  @Delete(':id')
  @RequirePermission('donors.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.interactions.remove(id, user.id);
  }
}
