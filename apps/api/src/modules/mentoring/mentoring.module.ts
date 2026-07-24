import { Module } from '@nestjs/common';
import { AlumniEngagementsController } from './alumni-engagements.controller';
import { AlumniEngagementsService } from './alumni-engagements.service';
import { MentorAssignmentsController } from './assignments.controller';
import { MentorAssignmentsService } from './assignments.service';
import { OutcomeCheckinsController } from './outcome-checkins.controller';
import { OutcomeCheckinsService } from './outcome-checkins.service';
import { MentorScreeningsController } from './screenings.controller';
import { MentorScreeningsService } from './screenings.service';

@Module({
  controllers: [
    AlumniEngagementsController,
    OutcomeCheckinsController,
    MentorScreeningsController,
    MentorAssignmentsController,
  ],
  providers: [
    AlumniEngagementsService,
    OutcomeCheckinsService,
    MentorScreeningsService,
    MentorAssignmentsService,
  ],
  exports: [
    AlumniEngagementsService,
    OutcomeCheckinsService,
    MentorScreeningsService,
    MentorAssignmentsService,
  ],
})
export class MentoringModule {}
