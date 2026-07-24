import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  publicAlumniUpdateSchema,
  publicReferralSchema,
  publicVolunteerApplicationSchema,
  type PublicReferralInput,
  type PublicVolunteerApplicationInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { Public } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { PublicIntakeService } from './public-intake.service';
import { TurnstileService } from './turnstile.service';

// The shared schema predates the Turnstile field on this form; extend locally
// so all three public endpoints run the same bot check.
const alumniUpdateBodySchema = publicAlumniUpdateSchema.extend({
  turnstileToken: z.string().max(4096).optional(),
});
type AlumniUpdateBody = z.infer<typeof alumniUpdateBodySchema>;

/**
 * The three public endpoints (§6.11). Unauthenticated but aggressively rate
 * limited, Turnstile-checked before any processing, and every response is a
 * bare { ok: true } — queue internals never leak to the public.
 */
@Controller('public')
@Public()
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class PublicController {
  constructor(
    private readonly turnstile: TurnstileService,
    private readonly publicIntake: PublicIntakeService,
  ) {}

  @Post('volunteer-applications')
  async submitVolunteerApplication(
    @Body(zodBody(publicVolunteerApplicationSchema)) body: PublicVolunteerApplicationInput,
  ) {
    await this.turnstile.verify(body.turnstileToken);
    return this.publicIntake.submitVolunteerApplication(body);
  }

  @Post('referrals')
  async submitReferral(@Body(zodBody(publicReferralSchema)) body: PublicReferralInput) {
    await this.turnstile.verify(body.turnstileToken);
    return this.publicIntake.submitReferral(body);
  }

  @Post('alumni-updates')
  async submitAlumniUpdate(@Body(zodBody(alumniUpdateBodySchema)) body: AlumniUpdateBody) {
    await this.turnstile.verify(body.turnstileToken);
    const { turnstileToken: _token, ...input } = body;
    return this.publicIntake.submitAlumniUpdate(input);
  }
}
