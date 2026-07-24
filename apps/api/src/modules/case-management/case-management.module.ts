import { Module } from '@nestjs/common';
import { CaseNotesController } from './case-notes.controller';
import { CaseNotesService } from './case-notes.service';
import { CaseServicesController } from './case-services.controller';
import { CaseServicesService } from './case-services.service';
import { CaseTasksController } from './case-tasks.controller';
import { CaseTasksService } from './case-tasks.service';
import { CaseloadController } from './caseload.controller';
import { CaseloadService } from './caseload.service';
import { NeedsAssessmentsController } from './needs-assessments.controller';
import { NeedsAssessmentsService } from './needs-assessments.service';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';
import { ServicePlansController } from './service-plans.controller';
import { ServicePlansService } from './service-plans.service';

@Module({
  controllers: [
    CaseNotesController,
    CaseloadController,
    CaseServicesController,
    ServicePlansController,
    CaseTasksController,
    ReferralsController,
    NeedsAssessmentsController,
    OnboardingController,
  ],
  providers: [
    CaseNotesService,
    CaseloadService,
    CaseServicesService,
    ServicePlansService,
    CaseTasksService,
    ReferralsService,
    NeedsAssessmentsService,
    OnboardingService,
  ],
  // CaseNotesService is exported for the reports module, which MUST use
  // listForExport() so confidential content never reaches an export (§7.3).
  exports: [
    CaseNotesService,
    CaseloadService,
    CaseServicesService,
    ServicePlansService,
    CaseTasksService,
    ReferralsService,
    NeedsAssessmentsService,
    OnboardingService,
  ],
})
export class CaseManagementModule {}
