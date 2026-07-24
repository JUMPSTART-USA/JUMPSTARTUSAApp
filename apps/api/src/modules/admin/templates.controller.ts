import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import {
  checklistTemplateSchema,
  mentorScreeningTemplateSchema,
  type ChecklistTemplateInput,
  type MentorScreeningTemplateInput,
} from '@jumpstart/shared';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { AdminTemplatesService } from './templates.service';

// Facility clearance requirements and communication templates are administered
// in their own domain modules — only checklist + screening templates live here.
@Controller('admin/templates')
export class AdminTemplatesController {
  constructor(private readonly templates: AdminTemplatesService) {}

  // ── Onboarding checklist templates (§6.5) ────────────────────────────────

  @Get('onboarding-checklists')
  @RequirePermission('admin.templates')
  listChecklists() {
    return this.templates.listChecklistTemplates();
  }

  @Get('onboarding-checklists/:id')
  @RequirePermission('admin.templates')
  getChecklist(@Param('id', ParseUUIDPipe) id: string) {
    return this.templates.getChecklistTemplate(id);
  }

  @Post('onboarding-checklists')
  @RequirePermission('admin.templates')
  createChecklist(
    @Body(zodBody(checklistTemplateSchema)) body: ChecklistTemplateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.templates.createChecklistTemplate(body, user.id);
  }

  /** PUT, not PATCH — the full template is required; items replace wholesale. */
  @Put('onboarding-checklists/:id')
  @RequirePermission('admin.templates')
  updateChecklist(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(checklistTemplateSchema)) body: ChecklistTemplateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.templates.updateChecklistTemplate(id, body, user.id);
  }

  @Delete('onboarding-checklists/:id')
  @RequirePermission('admin.templates')
  removeChecklist(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.templates.deactivateChecklistTemplate(id, user.id);
  }

  // ── Mentor screening templates (§6.7) ────────────────────────────────────

  @Get('mentor-screenings')
  @RequirePermission('admin.templates')
  listScreenings() {
    return this.templates.listScreeningTemplates();
  }

  @Get('mentor-screenings/:id')
  @RequirePermission('admin.templates')
  getScreening(@Param('id', ParseUUIDPipe) id: string) {
    return this.templates.getScreeningTemplate(id);
  }

  @Post('mentor-screenings')
  @RequirePermission('admin.templates')
  createScreening(
    @Body(zodBody(mentorScreeningTemplateSchema)) body: MentorScreeningTemplateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.templates.createScreeningTemplate(body, user.id);
  }

  @Put('mentor-screenings/:id')
  @RequirePermission('admin.templates')
  updateScreening(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(mentorScreeningTemplateSchema)) body: MentorScreeningTemplateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.templates.updateScreeningTemplate(id, body, user.id);
  }

  @Delete('mentor-screenings/:id')
  @RequirePermission('admin.templates')
  removeScreening(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.templates.deactivateScreeningTemplate(id, user.id);
  }
}
