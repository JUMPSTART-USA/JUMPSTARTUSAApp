import { Module } from '@nestjs/common';
import { BatchesService } from './batches.service';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';
import { ProviderService } from './provider.service';

/**
 * Communications center, Phase-1 slice (§6.12): templates, one-off sends with
 * suppression enforcement, per-person history, audience batches. Providers
 * are stubs (see ProviderService) — wiring Postmark/Twilio is a follow-up.
 */
@Module({
  controllers: [CommunicationsController],
  providers: [CommunicationsService, BatchesService, ProviderService],
  exports: [CommunicationsService, BatchesService],
})
export class CommunicationsModule {}
