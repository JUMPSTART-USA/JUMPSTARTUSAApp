import { Controller, Get, Post } from '@nestjs/common';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types';
import { EMAIL_FROM_SETTING_KEY, MailService } from '../../mail/mail.service';

/**
 * Outbound-email administration: shows whether Graph credentials are present,
 * which mailbox invites come from (assignable via the email.fromAddress app
 * setting), and a test-send to the signed-in admin.
 */
@Controller('admin/email')
export class AdminEmailController {
  constructor(private readonly mail: MailService) {}

  @Get('config')
  @RequirePermission('admin.settings')
  async config() {
    return {
      configured: this.mail.configured(),
      fromAddress: await this.mail.fromAddress(),
      settingKey: EMAIL_FROM_SETTING_KEY,
      envVars: ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET'],
    };
  }

  @Post('test')
  @RequirePermission('admin.settings')
  async test(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.mail.send(
      user.email,
      'JUMPSTART USA Operations Platform — test email',
      `<p>Hi ${user.firstName},</p><p>This is a test email from the Operations Platform. ` +
        'Outbound email is working.</p><p>— JUMPSTART USA</p>',
    );
    return { ...result, to: user.email };
  }
}
