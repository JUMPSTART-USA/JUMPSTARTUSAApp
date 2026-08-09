import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  HOUSING_STATUSES,
  housingEnrollmentSchema,
  housingTransferSchema,
  listQuerySchema,
  uuid,
  type HousingEnrollmentInput,
  type HousingTransferInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { HousingService, type HousingEnrollmentUpdate } from './housing.service';

const listFiltersSchema = listQuerySchema.extend({
  homeId: uuid.optional(),
  participantProfileId: uuid.optional(),
  status: z.enum(HOUSING_STATUSES).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

// PATCH payload: the shared schema is a ZodEffects (cross-field refinements),
// so the partial comes from innerType(); the service re-validates the merged
// state. participantProfileId/homeId are excluded — re-pointing an enrollment
// would rewrite history; moving homes goes through the transfer endpoint.
const enrollmentUpdateSchema = housingEnrollmentSchema
  .innerType()
  .omit({ participantProfileId: true, homeId: true })
  .partial();

@Controller('housing-enrollments')
export class HousingEnrollmentsController {
  constructor(private readonly housing: HousingService) {}

  @Get()
  @RequirePermission('housing.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { homeId, participantProfileId, status, ...listQuery } = query;
    return this.housing.listEnrollments(
      listQuery as ListQuery,
      { homeId, participantProfileId, status },
      user,
    );
  }

  @Get(':id')
  @RequirePermission('housing.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.housing.getEnrollment(id, user);
  }

  @Post()
  @RequirePermission('housing.create')
  moveIn(
    @Body(zodBody(housingEnrollmentSchema)) body: HousingEnrollmentInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.housing.moveIn(body, user);
  }

  @Patch(':id')
  @RequirePermission('housing.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(enrollmentUpdateSchema)) body: HousingEnrollmentUpdate,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.housing.updateEnrollment(id, body, user);
  }

  @Post(':id/transfer')
  @RequirePermission('housing.update')
  transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(housingTransferSchema)) body: HousingTransferInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.housing.transfer(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('housing.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.housing.softDeleteEnrollment(id, user);
  }
}
