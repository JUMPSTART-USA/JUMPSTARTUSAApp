import { Module } from '@nestjs/common';
import { AppealsController } from './appeals.controller';
import { AppealsService } from './appeals.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { DonationsController } from './donations.controller';
import { DonationsService } from './donations.service';
import { DonorTasksController } from './donor-tasks.controller';
import { DonorTasksService } from './donor-tasks.service';
import { DonorsController } from './donors.controller';
import { DonorsService } from './donors.service';
import { EventRegistrationsController, EventsController } from './events.controller';
import { EventsService } from './events.service';
import { FundsController } from './funds.controller';
import { FundsService } from './funds.service';
import { HouseholdsController } from './households.controller';
import { HouseholdsService } from './households.service';
import { InteractionsController } from './interactions.controller';
import { InteractionsService } from './interactions.service';
import { PledgesController } from './pledges.controller';
import { PledgesService } from './pledges.service';
import { RecurringGiftsController } from './recurring-gifts.controller';
import { RecurringGiftsService } from './recurring-gifts.service';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';

/**
 * Development CRM (§6.8) — native donor management modeled on dedicated donor
 * CRMs: donors, households, relationships, gifts (with funds/appeals/tributes/
 * soft credits), pledges, recurring gifts, interactions, stewardship tasks,
 * campaigns, events, vendors.
 */
@Module({
  controllers: [
    DonorsController,
    DonationsController,
    FundsController,
    AppealsController,
    HouseholdsController,
    PledgesController,
    RecurringGiftsController,
    InteractionsController,
    DonorTasksController,
    CampaignsController,
    EventsController,
    EventRegistrationsController,
    VendorsController,
  ],
  providers: [
    DonorsService,
    DonationsService,
    FundsService,
    AppealsService,
    HouseholdsService,
    PledgesService,
    RecurringGiftsService,
    InteractionsService,
    DonorTasksService,
    CampaignsService,
    EventsService,
    VendorsService,
  ],
  exports: [
    DonorsService,
    DonationsService,
    FundsService,
    AppealsService,
    HouseholdsService,
    PledgesService,
    RecurringGiftsService,
    InteractionsService,
    DonorTasksService,
    CampaignsService,
    EventsService,
    VendorsService,
  ],
})
export class CrmModule {}
