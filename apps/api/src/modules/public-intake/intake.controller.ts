import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  CHAPTER_STATES,
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
  state: z.enum(CHAPTER_STATES).optional(),
});
type QueueQuery = z.infer<typeof queueQuerySchema>;

// Legacy queue rows may predate the public forms' required chapter field —
// reviewing one needs an explicit chapter pick (§7.2, docs/chapter-scoping.md).
const reviewWithChapterSchema = intakeReviewSchema.extend({
  state: z.enum(CHAPTER_STATES).optional(),
});
type ReviewWithChapterInput = z.infer<typeof reviewWithChapterSchema>;

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
  listVolunteerApplications(
    @Query(zodQuery(queueQuerySchema)) query: QueueQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { status, state, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.review.listVolunteerApplications(listQuery as ListQuery, {
      status,
      state: user.chapter ?? state,
    });
  }

  @Get('referrals')
  @RequirePermission('intake_queues.read', 'referral_inbox.read')
  listReferrals(
    @Query(zodQuery(queueQuerySchema)) query: QueueQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { status, state, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.review.listReferrals(listQuery as ListQuery, {
      status,
      state: user.chapter ?? state,
    });
  }

  @Get('alumni-updates')
  @RequirePermission('intake_queues.read')
  listAlumniUpdates(
    @Query(zodQuery(queueQuerySchema)) query: QueueQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { status, state, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.review.listAlumniUpdates(listQuery as ListQuery, {
      status,
      state: user.chapter ?? state,
    });
  }

  /** Counts only — safe for dashboards without referral_inbox.read. */
  @Get('summary')
  @RequirePermission('intake_queues.read')
  summary(@CurrentUser() user: AuthenticatedUser) {
    // Chapter scoping (§7.2): scoped users' counts cover only their chapter.
    return this.review.summary(user.chapter);
  }

  @Post('volunteer-applications/:id/review')
  @RequirePermission('intake_queues.update')
  reviewVolunteerApplication(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(reviewWithChapterSchema)) body: ReviewWithChapterInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.review.reviewVolunteerApplication(id, body, user);
  }

  @Post('referrals/:id/review')
  @RequirePermission('intake_queues.update', 'referral_inbox.read')
  reviewReferral(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(reviewWithChapterSchema)) body: ReviewWithChapterInput,
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
