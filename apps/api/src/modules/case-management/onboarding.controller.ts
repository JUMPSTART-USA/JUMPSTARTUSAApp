import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  checklistItemUpdateSchema,
  listQuerySchema,
  uuid,
  type ChecklistItemUpdateInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { OnboardingService, type CreateChecklistInput } from './onboarding.service';

// No shared schema exists for instantiation — the template body is admin-side
// (checklistTemplateSchema); instantiation only picks a participant + template.
const createChecklistSchema = z.object({
  participantProfileId: uuid,
  templateId: uuid.optional(),
});

const listFiltersSchema = listQuerySchema.extend({
  participantProfileId: uuid.optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post('checklists')
  @RequirePermission('case_management.create')
  createChecklist(
    @Body(zodBody(createChecklistSchema)) body: CreateChecklistInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.onboarding.createChecklist(body, user.id);
  }

  @Get('checklists')
  @RequirePermission('case_management.read')
  listChecklists(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { participantProfileId, ...listQuery } = query;
    return this.onboarding.listChecklists(listQuery as ListQuery, { participantProfileId });
  }

  @Get('checklists/:id')
  @RequirePermission('case_management.read')
  getChecklist(@Param('id', ParseUUIDPipe) id: string) {
    return this.onboarding.getChecklist(id);
  }

  @Patch('items/:itemId')
  @RequirePermission('case_management.update')
  updateItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(zodBody(checklistItemUpdateSchema)) body: ChecklistItemUpdateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.onboarding.updateItem(itemId, body, user.id);
  }
}
