import { Module } from '@nestjs/common';
import { ParticipantSubresourcesService } from './participant-subresources.service';
import { ParticipantTimelineService } from './participant-timeline.service';
import { ParticipantsController } from './participants.controller';
import { ParticipantsService } from './participants.service';

@Module({
  controllers: [ParticipantsController],
  providers: [ParticipantsService, ParticipantTimelineService, ParticipantSubresourcesService],
  exports: [ParticipantsService],
})
export class ParticipantsModule {}
