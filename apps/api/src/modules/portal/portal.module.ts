import { Module } from '@nestjs/common';
import { MeetingRequestsController } from './meeting-requests.controller';
import { MeetingRequestsService } from './meeting-requests.service';
import { PortalMessagesController } from './portal-messages.controller';
import { PortalMessagesService } from './portal-messages.service';
import { PortalPublicController } from './portal-public.controller';
import { PortalPublicService } from './portal-public.service';
import { PortalTokensController } from './portal-tokens.controller';
import { PortalTokensService } from './portal-tokens.service';
import { TransportRequestsController } from './transport-requests.controller';
import { TransportRequestsService } from './transport-requests.service';

/**
 * Participant portal: staff-issued tokenized links (no participant logins),
 * unauthenticated /public/portal/:token endpoints that feed three
 * staff-reviewed queues (messages, meeting requests, transport requests).
 * Public submissions never create operational records directly — every row
 * waits in a queue for a staff decision.
 */
@Module({
  controllers: [
    PortalTokensController,
    PortalPublicController,
    PortalMessagesController,
    MeetingRequestsController,
    TransportRequestsController,
  ],
  providers: [
    PortalTokensService,
    PortalPublicService,
    PortalMessagesService,
    MeetingRequestsService,
    TransportRequestsService,
  ],
  exports: [
    PortalTokensService,
    PortalPublicService,
    PortalMessagesService,
    MeetingRequestsService,
    TransportRequestsService,
  ],
})
export class PortalModule {}
