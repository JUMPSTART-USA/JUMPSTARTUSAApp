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
  listQuerySchema,
  type CampaignInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { CampaignsService } from './campaigns.service';
import { DonorCrmConfigService } from './donor-crm-config.service';

const listFiltersSchema = listQuerySchema.extend({
  status: z.enum(['planned', 'active', 'completed', 'canceled']).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

// campaignSchema is a ZodEffects (cross-field date refinement) — partial() lives
// on the inner object; the merged-record date check runs in the service.
const campaignUpdateSchema = campaignSchema.innerType().partial();

// With an active donor CRM, campaigns are a read-only mirror (§6.8): create/
// delete happen in the CRM, and PATCH may touch these local fields only.
const CAMPAIGN_LOCAL_FIELDS = ['notes'] as const;

@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly crmConfig: DonorCrmConfigService,
  ) {}

  @Get()
  @RequirePermission('campaigns.read')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { status, ...listQuery } = query;
    return this.campaigns.list(listQuery as ListQuery, { status });
  }

  @Get(':id')
  @RequirePermission('campaigns.read')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.detail(id);
  }

  @Post()
  @RequirePermission('campaigns.create')
  async create(
    @Body(zodBody(campaignSchema)) body: CampaignInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.crmConfig.assertMirrorWritable('Campaigns');
    return this.campaigns.create(body, user.id);
  }

  @Patch(':id')
  @RequirePermission('campaigns.update')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(campaignUpdateSchema)) body: Partial<CampaignInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.crmConfig.assertLocalOnlyUpdate(body, CAMPAIGN_LOCAL_FIELDS);
    return this.campaigns.update(id, body, user.id);
  }

  @Delete(':id')
  @RequirePermission('campaigns.delete')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.crmConfig.assertMirrorWritable('Campaigns');
    return this.campaigns.softDelete(id, user.id);
  }
}
