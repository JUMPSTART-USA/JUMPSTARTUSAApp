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
  state: z.enum(CHAPTER_STATES).optional(),
  from: optionalDate,
  to: optionalDate,
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('donor-interactions')
export class InteractionsController {
  constructor(private readonly interactions: InteractionsService) {}

  @Get()
  @RequirePermission('donors.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { donorId, channel, purpose, state, from, to, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.interactions.list(listQuery as ListQuery, {
      donorId,
      channel,
      purpose,
      state: (user.chapter ?? state) as ListFilters['state'],
      from,
      to,
    });
  }

  @Post()
  @RequirePermission('donors.create')
  create(
    @Body(zodBody(donorInteractionSchema)) body: DonorInteractionInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.interactions.create(body, user);
  }

  @Patch(':id')
  @RequirePermission('donors.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(donorInteractionSchema.partial())) body: Partial<DonorInteractionInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.interactions.update(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('donors.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.interactions.remove(id, user);
  }
}
