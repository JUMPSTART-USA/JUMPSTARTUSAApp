import { Module } from '@nestjs/common';
import { EmployersController } from './employers.controller';
import { EmployersService } from './employers.service';
import { EmploymentsController } from './employments.controller';
import { EmploymentsService } from './employments.service';

@Module({
  controllers: [EmployersController, EmploymentsController],
  providers: [EmployersService, EmploymentsService],
  exports: [EmployersService, EmploymentsService],
})
export class EmploymentModule {}
