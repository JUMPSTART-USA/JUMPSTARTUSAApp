import { Module } from '@nestjs/common';
import { DrugTestsController } from './drug-tests.controller';
import { DrugTestsService } from './drug-tests.service';
import { OutsideProgramsController } from './outside-programs.controller';
import { OutsideProgramsService } from './outside-programs.service';

@Module({
  controllers: [OutsideProgramsController, DrugTestsController],
  providers: [OutsideProgramsService, DrugTestsService],
  exports: [OutsideProgramsService, DrugTestsService],
})
export class OutsideProgramsModule {}
