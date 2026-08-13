import { Module } from '@nestjs/common';
import { ClientErrorsController } from './client-errors.controller';
import { ClientErrorsService } from './client-errors.service';

/** Client-side error reports (§5 phase 5). */
@Module({
  controllers: [ClientErrorsController],
  providers: [ClientErrorsService],
})
export class ObservabilityModule {}
