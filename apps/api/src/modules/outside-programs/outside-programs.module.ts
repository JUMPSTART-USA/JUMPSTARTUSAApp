import { Module } from '@nestjs/common';
import { OutsideProgramsController } from './outside-programs.controller';
import { OutsideProgramsService } from './outside-programs.service';

@Module({
  controllers: [OutsideProgramsController],
  providers: [OutsideProgramsService],
  exports: [OutsideProgramsService],
})
export class OutsideProgramsModule {}
