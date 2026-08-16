import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  @Public()
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      time: new Date().toISOString(),
      /**
       * Outbound email is a SECURITY dependency, not a convenience:
       * account-lockout warnings, second-factor resets, and email and role
       * changes all reach the account holder through it.
       *
       * This used to report `configured` — which only meant three environment
       * variables were non-empty. It said "configured" for weeks while every
       * send failed with a 401, because the stored client secret was a secret
       * ID rather than a secret value. A health check that reports presence
       * and calls it health is worse than none: it answers the question you
       * meant to ask with the one it can cheaply compute.
       *
       * `sendPath` is the real answer — a client-credentials token really
       * acquired from Entra. Coarse on purpose: this endpoint is public, and
       * the AADSTS detail describes the tenant's identity configuration, so it
       * goes to the log instead.
       *
       * Deliberately NOT folded into `status`: broken mail must not fail the
       * App Service probe and pull a working API out of rotation. It is a
       * thing to fix, not a reason to take the platform down.
       */
      mail: this.mail.health(),
    };
  }
}
