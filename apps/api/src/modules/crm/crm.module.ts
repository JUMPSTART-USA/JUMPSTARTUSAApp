import { Module } from '@nestjs/common';
import { BloomerangSyncService } from './bloomerang-sync.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { DonationsController } from './donations.controller';
import { DonationsService } from './donations.service';
import { DonorsController } from './donors.controller';
import { DonorsService } from './donors.service';
import { EventRegistrationsController, EventsController } from './events.controller';
import { EventsService } from './events.service';
import { SyncController } from './sync.controller';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';

/** Donor/Vendor/Campaign/Event CRM — Bloomerang mirror + in-platform ops (§6.8). */
@Module({
  controllers: [
    DonorsController,
    DonationsController,
    CampaignsController,
    EventsController,
    EventRegistrationsController,
    VendorsController,
    SyncController,
  ],
  providers: [
    DonorsService,
    DonationsService,
    CampaignsService,
    EventsService,
    VendorsService,
    BloomerangSyncService,
  ],
  exports: [
    DonorsService,
    DonationsService,
    CampaignsService,
    EventsService,
    VendorsService,
    BloomerangSyncService,
  ],
})
export class CrmModule {}
