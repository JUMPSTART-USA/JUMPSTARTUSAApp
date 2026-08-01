import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { uuid } from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { AdminPersonMergeService } from './person-merge.service';

// Admin-tool payloads, not reused by any public form — shaped locally (the
// roles/users controllers set the precedent); field keys are validated
// against MERGEABLE_PERSON_FIELDS in the service so errors can name them.
const searchSchema = z.object({ q: z.string().trim().min(2).max(200) });
type SearchQuery = z.infer<typeof searchSchema>;

const pairSchema = z.object({
  winnerPersonId: uuid,
  loserPersonId: uuid,
});
type PairInput = z.infer<typeof pairSchema>;

const mergeSchema = pairSchema.extend({
  fieldOverrides: z.record(z.string().max(64), z.enum(['winner', 'loser'])).optional(),
});
type MergeInput = z.infer<typeof mergeSchema>;

@Controller('admin/person-merge')
export class AdminPersonMergeController {
  constructor(private readonly personMerge: AdminPersonMergeService) {}

  @Get('search')
  @RequirePermission('person.merge')
  search(@Query(zodQuery(searchSchema)) query: SearchQuery) {
    return this.personMerge.search(query.q);
  }

  @Post('preview')
  @RequirePermission('person.merge')
  preview(@Body(zodBody(pairSchema)) body: PairInput) {
    return this.personMerge.preview(body.winnerPersonId, body.loserPersonId);
  }

  @Post()
  @RequirePermission('person.merge')
  merge(@Body(zodBody(mergeSchema)) body: MergeInput, @CurrentUser() user: AuthenticatedUser) {
    return this.personMerge.merge(
      body.winnerPersonId,
      body.loserPersonId,
      body.fieldOverrides,
      user.id,
    );
  }
}
