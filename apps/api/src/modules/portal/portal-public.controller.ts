import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  meetingRequestSchema,
  portalMessageSchema,
  transportRequestSchema,
  type MeetingRequestInput,
  type PortalMessageInput,
  type TransportRequestInput,
} from '@jumpstart/shared';
import { Public, SkipOriginCheck } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { PortalPublicService } from './portal-public.service';

/**
 * Tokenized participant portal endpoints. Unauthenticated but aggressively
 * rate limited (same posture as public-intake's PublicController). No
 * Turnstile here — the unguessable tokenized link is the anti-spam gate, plus
 * a per-token daily submission cap in the service. Unknown/revoked tokens are
 * a bare 404 on every route.
 */
// @SkipOriginCheck: opened from a link a participant was given, which may be
// pasted anywhere — there is no SPA origin to match. The unguessable token and
// the per-token daily cap are the defence.
@Controller('public/portal')
@Public()
@SkipOriginCheck()
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class PortalPublicController {
  constructor(private readonly portal: PortalPublicService) {}

  @Get(':token')
  resolve(@Param('token') token: string) {
    return this.portal.resolve(token);
  }

  @Post(':token/messages')
  submitMessage(
    @Param('token') token: string,
    @Body(zodBody(portalMessageSchema)) body: PortalMessageInput,
  ) {
    return this.portal.submitMessage(token, body);
  }

  @Post(':token/meeting-requests')
  submitMeetingRequest(
    @Param('token') token: string,
    @Body(zodBody(meetingRequestSchema)) body: MeetingRequestInput,
  ) {
    return this.portal.submitMeetingRequest(token, body);
  }

  @Post(':token/transport-requests')
  submitTransportRequest(
    @Param('token') token: string,
    @Body(zodBody(transportRequestSchema)) body: TransportRequestInput,
  ) {
    return this.portal.submitTransportRequest(token, body);
  }
}
