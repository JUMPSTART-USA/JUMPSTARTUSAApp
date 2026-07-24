import { Module } from '@nestjs/common';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
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
    // (volunteers/background-checks, …) are matched before volunteers/:id.
    AssignmentsController,
    BackgroundChecksController,
    TrainingsController,
    FacilityRequirementsController,
    ClearancesController,
    VolunteersController,
  ],
  providers: [VolunteersService, ScreeningService, AssignmentsService],
  exports: [VolunteersService, ScreeningService],
})
export class VolunteersModule {}
