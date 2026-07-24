import { Controller, Get } from '@nestjs/common';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types';
import { CaseloadService } from './caseload.service';

@Controller()
export class CaseloadController {
  constructor(private readonly caseload: CaseloadService) {}

  /** Case manager home screen: my follow-up queue (§6.5). */
  @Get('follow-ups')
  @RequirePermission('case_management.read')
  followUps(@CurrentUser() user: AuthenticatedUser) {
    return this.caseload.followUps(user.id);
  }

  /** Supervisor caseload dashboard — counts only, no note content (§7.3). */
  @Get('caseload-summary')
  @RequirePermission('case_management.read')
  caseloadSummary() {
    return this.caseload.caseloadSummary();
  }
}
