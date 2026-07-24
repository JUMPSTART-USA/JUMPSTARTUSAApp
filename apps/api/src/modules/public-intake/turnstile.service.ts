import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { loadEnv } from '../../config/env';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Cloudflare Turnstile bot check — runs before validation/processing on every
 * /public/* submission (§6.11). Fails CLOSED: a missing/invalid token, a
 * missing secret, or an unreachable verify endpoint all reject the submission.
 */
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  async verify(token: string | undefined): Promise<void> {
    const env = loadEnv();
    if (env.TURNSTILE_DEV_BYPASS) return; // local development only

    if (!env.TURNSTILE_SECRET_KEY) {
      // Misconfiguration must not silently open the public front door.
      this.logger.error('TURNSTILE_SECRET_KEY is not set and TURNSTILE_DEV_BYPASS is not enabled');
      throw new ServiceUnavailableException('Submissions are temporarily unavailable');
    }
    if (!token) throw new BadRequestException('Bot verification failed');

    let success: boolean;
    try {
      const res = await fetch(VERIFY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
      });
      const data = (await res.json()) as { success?: boolean };
      success = data.success === true;
    } catch (err) {
      this.logger.error(
        'Turnstile verification request failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new ServiceUnavailableException('Submissions are temporarily unavailable');
    }
    if (!success) throw new BadRequestException('Bot verification failed');
  }
}
