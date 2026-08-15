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
       * Reported because outbound email is a SECURITY dependency, not merely a
       * convenience: account-lockout warnings, second-factor resets, and email
       * and role changes all reach the account holder through it. Unconfigured
       * mail means every one of those is silently skipped, and the person who
       * would notice an attack on their account is the person who hears
       * nothing.
       *
       * Deliberately NOT folded into `status`: mail being unconfigured must
       * not fail the App Service health probe and pull a working API out of
       * rotation.
       */
      mail: this.mail.configured() ? 'configured' : 'unconfigured',
    };
  }
}
