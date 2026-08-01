import { Module } from '@nestjs/common';
import { BatchesService } from './batches.service';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';
import { LettersService } from './letters.service';
import { ProviderService } from './provider.service';

/**
 * Communications center (§6.12): templates, one-off sends with suppression
 * enforcement, per-person history, audience batches, batch dispatch through
 * real providers (email via Microsoft Graph — the global MailModule; SMS via
 * Twilio when configured), and the letter PDF generator + returned-mail log.
 */
@Module({
  controllers: [CommunicationsController],
  providers: [CommunicationsService, BatchesService, ProviderService, LettersService],
  exports: [CommunicationsService, BatchesService],
})
export class CommunicationsModule {}
