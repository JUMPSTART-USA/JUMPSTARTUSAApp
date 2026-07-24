import { Module } from '@nestjs/common';
import { HousingEnrollmentsController } from './housing-enrollments.controller';
import { HousingService } from './housing.service';
import { TransitionalHomesController } from './transitional-homes.controller';

@Module({
  controllers: [TransitionalHomesController, HousingEnrollmentsController],
  providers: [HousingService],
  exports: [HousingService],
})
export class HousingModule {}
