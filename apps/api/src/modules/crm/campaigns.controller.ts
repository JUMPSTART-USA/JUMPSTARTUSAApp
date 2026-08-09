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
  campaignSchema,
  CHAPTER_STATES,
  listQuerySchema,
  type CampaignInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { CampaignsService } from './campaigns.service';

const listFiltersSchema = listQuerySchema.extend({
  status: z.enum(['planned', 'active', 'completed', 'canceled']).optional(),
  // External param stays `state`, but it filters the CHAPTER column (§7.2).
  state: z.enum(CHAPTER_STATES).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

// campaignSchema is a ZodEffects (cross-field date refinement) — partial() lives
// on the inner object; the merged-record date check runs in the service.
const campaignUpdateSchema = campaignSchema.innerType().partial();

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  @RequirePermission('campaigns.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { status, state, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.campaigns.list(listQuery as ListQuery, {
      status,
      chapterState: (user.chapter ?? state) as ListFilters['state'],
    });
  }

  @Get(':id')
  @RequirePermission('campaigns.read')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.campaigns.detail(id, user);
  }

  @Post()
  @RequirePermission('campaigns.create')
  create(
    @Body(zodBody(campaignSchema)) body: CampaignInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaigns.create(body, user);
  }

  @Patch(':id')
  @RequirePermission('campaigns.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(campaignUpdateSchema)) body: Partial<CampaignInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaigns.update(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('campaigns.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.campaigns.softDelete(id, user);
  }
}
