import { Module } from '@nestjs/common';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { HoursController } from './hours.controller';
import { HoursService } from './hours.service';
import {
  OpportunitiesController,
  ShiftsController,
  SignupsController,
} from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';
import {
  BackgroundChecksController,
  ClearancesController,
  FacilityRequirementsController,
  TrainingsController,
} from './screening.controller';
import { ScreeningService } from './screening.service';
import { VolunteersController } from './volunteers.controller';
import { VolunteersService } from './volunteers.service';

@Module({
  controllers: [
    // Sub-resource controllers register first so their static prefixes
    // (volunteers/background-checks, volunteers/opportunities, …) are matched
    // before volunteers/:id.
    AssignmentsController,
    BackgroundChecksController,
    TrainingsController,
    FacilityRequirementsController,
    ClearancesController,
    OpportunitiesController,
    ShiftsController,
    SignupsController,
    HoursController,
    VolunteersController,
  ],
  providers: [
    VolunteersService,
    ScreeningService,
    AssignmentsService,
    OpportunitiesService,
    HoursService,
  ],
  exports: [VolunteersService, ScreeningService],
})
export class VolunteersModule {}
