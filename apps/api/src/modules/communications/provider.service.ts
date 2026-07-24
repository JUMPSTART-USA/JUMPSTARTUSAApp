import { Injectable, Logger } from '@nestjs/common';
import { loadEnv } from '../../config/env';

export interface ProviderSendResult {
  sent: boolean;
  detail?: string;
}

/**
 * Channel providers (§6.12) — Phase-1 STUBS. Without provider credentials the
 * message is marked sent immediately so the communications log, suppression
 * rules, and timelines are exercisable end to end. Real providers are a
 * wiring task:
 *
 * TODO(wiring): Postmark email send (POSTMARK_SERVER_TOKEN) + bounce/complaint
 *   webhooks updating Person.emailBouncedAt.
 * TODO(wiring): Twilio SMS send + automatic STOP handling (clears smsOk);
 *   requires A2P 10DLC registration (§6.12) and TWILIO_* keys declared in
 *   src/config/env.ts.
 *
 * Letters never come through here — the Phase-2 batch generator renders
 * merged PDFs for printing, so 'letter' rows stay queued.
 */
@Injectable()
export class ProviderService {
  private readonly logger = new Logger(ProviderService.name);

  async sendEmail(to: string, _subject: string, _body: string): Promise<ProviderSendResult> {
    const env = loadEnv();
    if (!env.POSTMARK_SERVER_TOKEN) {
      return { sent: true, detail: 'stub: no Postmark credentials configured' };
    }
    // TODO(wiring): POST https://api.postmarkapp.com/email with the server token.
    this.logger.warn(`Postmark send not wired yet — marking email to ${to} as sent`);
    return { sent: true, detail: 'stub: Postmark wiring pending' };
  }

  async sendSms(to: string, _body: string): Promise<ProviderSendResult> {
    // env.ts does not declare TWILIO_* yet; read process.env until wiring lands.
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      return { sent: true, detail: 'stub: no Twilio credentials configured' };
    }
    // TODO(wiring): Twilio Messages API call.
    this.logger.warn(`Twilio send not wired yet — marking SMS to ${to} as sent`);
    return { sent: true, detail: 'stub: Twilio wiring pending' };
  }
}
