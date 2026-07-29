import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

/** Bug reports & feature suggestions from any signed-in user (§6.15). */
@Module({
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
