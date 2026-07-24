import { Module } from '@nestjs/common';
import { InsideClassesController } from './inside-classes.controller';
import { InsideClassesService } from './inside-classes.service';

@Module({
  controllers: [InsideClassesController],
  providers: [InsideClassesService],
  exports: [InsideClassesService],
})
export class InsideClassesModule {}
