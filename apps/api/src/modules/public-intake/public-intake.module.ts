import { Module } from '@nestjs/common';
import { IntakeController } from './intake.controller';
import { IntakeReviewService } from './intake-review.service';
import { PublicController } from './public.controller';
import { PublicIntakeService } from './public-intake.service';
import { TurnstileService } from './turnstile.service';

/**
 * Public-facing intake pipeline (§6.11): unauthenticated /public/* forms feed
 * staff-reviewed queues under /intake/* — public submissions never create
 * operational records directly.
 */
@Module({
  controllers: [PublicController, IntakeController],
  providers: [PublicIntakeService, IntakeReviewService, TurnstileService],
  exports: [IntakeReviewService],
})
export class PublicIntakeModule {}
