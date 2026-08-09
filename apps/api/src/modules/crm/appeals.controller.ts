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
  appealSchema,
  CHAPTER_STATES,
  listQuerySchema,
  uuid,
  type AppealInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { AppealsService } from './appeals.service';

const listFiltersSchema = listQuerySchema.extend({
  state: z.enum(CHAPTER_STATES).optional(),
  campaignId: uuid.optional(),
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

// appealSchema is a ZodEffects (cross-field date refinement) — partial() lives
// on the inner object; the merged-record date check runs in the service.
const appealUpdateSchema = appealSchema.innerType().partial();

// Appeals sit under campaigns organizationally, so they carry campaigns.* perms.
@Controller('appeals')
export class AppealsController {
  constructor(private readonly appeals: AppealsService) {}

  @Get()
  @RequirePermission('campaigns.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { state, campaignId, active, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.appeals.list(listQuery as ListQuery, {
      state: user.chapter ?? state,
      campaignId,
      active,
    });
  }

  @Post()
  @RequirePermission('campaigns.create')
  create(
    @Body(zodBody(appealSchema)) body: AppealInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appeals.create(body, user);
  }

  @Patch(':id')
  @RequirePermission('campaigns.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(appealUpdateSchema)) body: Partial<AppealInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appeals.update(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('campaigns.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.appeals.softDelete(id, user);
  }
}
