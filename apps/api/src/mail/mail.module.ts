import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/** Global: any module may send email without importing plumbing. */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
