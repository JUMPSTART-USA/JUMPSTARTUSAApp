import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  INTAKE_STATUSES,
  intakeReviewSchema,
  listQuerySchema,
  type IntakeReviewInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { IntakeReviewService } from './intake-review.service';

const queueQuerySchema = listQuerySchema.extend({
  status: z.enum(INTAKE_STATUSES).optional(),
});
type QueueQuery = z.infer<typeof queueQuerySchema>;

const alumniFormTokenSchema = z.object({ participantProfileId: z.string().uuid() });
type AlumniFormTokenBody = z.infer<typeof alumniFormTokenSchema>;

/**
 * Staff review side of the intake pipeline (§6.11). Every referral endpoint
 * ADDITIONALLY requires referral_inbox.read — the queue holds third-party PII
 * about justice-involved people, walled tighter than the other queues.
 */
@Controller('intake')
export class IntakeController {
  constructor(private readonly review: IntakeReviewService) {}

  @Get('volunteer-applications')
  @RequirePermission('intake_queues.read')
  listVolunteerApplications(@Query(zodQuery(queueQuerySchema)) query: QueueQuery) {
    const { status, ...listQuery } = query;
    return this.review.listVolunteerApplications(listQuery as ListQuery, { status });
  }

  @Get('referrals')
  @RequirePermission('intake_queues.read', 'referral_inbox.read')
  listReferrals(@Query(zodQuery(queueQuerySchema)) query: QueueQuery) {
    const { status, ...listQuery } = query;
    return this.review.listReferrals(listQuery as ListQuery, { status });
  }

  @Get('alumni-updates')
  @RequirePermission('intake_queues.read')
  listAlumniUpdates(@Query(zodQuery(queueQuerySchema)) query: QueueQuery) {
    const { status, ...listQuery } = query;
    return this.review.listAlumniUpdates(listQuery as ListQuery, { status });
  }

  /** Counts only — safe for dashboards without referral_inbox.read. */
  @Get('summary')
  @RequirePermission('intake_queues.read')
  summary() {
    return this.review.summary();
  }

  @Post('volunteer-applications/:id/review')
  @RequirePermission('intake_queues.update')
  reviewVolunteerApplication(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(intakeReviewSchema)) body: IntakeReviewInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.review.reviewVolunteerApplication(id, body, user);
  }

  @Post('referrals/:id/review')
  @RequirePermission('intake_queues.update', 'referral_inbox.read')
  reviewReferral(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(intakeReviewSchema)) body: IntakeReviewInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.review.reviewReferral(id, body, user);
  }

  @Post('alumni-updates/:id/review')
  @RequirePermission('intake_queues.update')
  reviewAlumniUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(intakeReviewSchema)) body: IntakeReviewInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.review.reviewAlumniUpdate(id, body, user);
  }

  @Post('alumni-form-tokens')
  @RequirePermission('alumni.update')
  createAlumniFormToken(
    @Body(zodBody(alumniFormTokenSchema)) body: AlumniFormTokenBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.review.createAlumniFormToken(body.participantProfileId, user);
  }
}
