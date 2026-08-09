import { Controller, Get, Query } from '@nestjs/common';
import {
  CHAPTER_STATES,
  endNotBeforeStart,
  INSIDE_STATUSES,
  optionalDate,
  OUTSIDE_STATUSES,
  PROGRAM_TYPES,
  uuid,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { DashboardService } from './dashboard.service';

// Status values overlap between the inside and outside domains (active,
// completed, withdrawn…) — the service matches whichever domain(s) define
// the filtered value.
const PARTICIPANT_STATUS_FILTERS = [
  ...new Set<string>([...INSIDE_STATUSES, ...OUTSIDE_STATUSES]),
] as [string, ...string[]];

const dashboardQuerySchema = z
  .object({
    from: optionalDate,
    to: optionalDate,
    state: z.enum(CHAPTER_STATES).optional(),
    institutionId: uuid.optional(),
    programType: z.enum(PROGRAM_TYPES).optional(),
    participantStatus: z.enum(PARTICIPANT_STATUS_FILTERS).optional(),
  })
  .superRefine(endNotBeforeStart('from', 'to'));
type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @RequirePermission('dashboard.read')
  overview(
    @Query(zodQuery(dashboardQuerySchema)) query: DashboardQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.dashboard.overview(
      { ...query, state: (user.chapter ?? query.state) as DashboardQuery['state'] },
      user,
    );
  }
}
