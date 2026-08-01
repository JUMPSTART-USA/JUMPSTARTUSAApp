import { Injectable, Logger } from '@nestjs/common';
import { loadEnv } from '../../config/env';
import { MailService } from '../../mail/mail.service';

export interface ProviderSendResult {
  sent: boolean;
  detail?: string;
}

/**
 * Channel providers (§6.12).
 *
 * Email rides the SAME Microsoft Graph mail path the admin invites use
 * (MailService: GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET, From
 * address admin-assignable via Admin → Settings falling back to EMAIL_FROM) —
 * the org runs Microsoft 365, no third-party mail vendor. Unconfigured or
 * failed sends report { sent: false, detail } so callers mark the row failed
 * instead of silently pretending delivery.
 *
 * SMS sends via the Twilio REST API (plain fetch, no SDK) when all of
 * TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER are configured;
 * otherwise every SMS fails gracefully with a clear statusDetail. STOP
 * handling (clearing smsOk) and A2P 10DLC registration remain follow-ups.
 *
 * Letters never come through here — the batch letter generator renders merged
 * PDFs for printing (GET /communications/batches/:id/letters.pdf).
 */
@Injectable()
export class ProviderService {
  private readonly logger = new Logger(ProviderService.name);

  constructor(private readonly mail: MailService) {}

  async sendEmail(to: string, subject: string, body: string): Promise<ProviderSendResult> {
    if (!this.mail.configured()) {
      return { sent: false, detail: 'email provider not configured' };
    }
    // Bodies are authored as plain text; render as simple HTML paragraphs.
    const result = await this.mail.send(to, subject, textToHtml(body));
    if (!result.sent) {
      // MailService already logged the Graph error with detail.
      return { sent: false, detail: 'email send failed (Microsoft Graph) — see server logs' };
    }
    return { sent: true };
  }

  async sendSms(to: string, body: string): Promise<ProviderSendResult> {
    const env = loadEnv();
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
      return { sent: false, detail: 'SMS provider not configured (Twilio pending)' };
    }
    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
          env.TWILIO_ACCOUNT_SID,
        )}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(
              `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`,
            ).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: to, From: env.TWILIO_FROM_NUMBER, Body: body }),
        },
      );
      if (!res.ok) {
        const text = await res.text();
        this.logger.error(`Twilio send failed (${res.status}): ${text.slice(0, 300)}`);
        return { sent: false, detail: `Twilio send failed (HTTP ${res.status})` };
      }
      return { sent: true };
    } catch (err) {
      this.logger.error('Twilio send error', err instanceof Error ? err.stack : String(err));
      return { sent: false, detail: 'Twilio send failed (network error)' };
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Plain text → HTML: blank-line-separated paragraphs, single newlines as <br/>. */
function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}
