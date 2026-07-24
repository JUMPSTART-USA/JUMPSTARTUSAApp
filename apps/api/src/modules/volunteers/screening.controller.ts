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
  backgroundCheckSchema,
  CLEARANCE_STATUSES,
  clearanceRequirementSchema,
  listQuerySchema,
  uuid,
  volunteerClearanceSchema,
  volunteerTrainingSchema,
  type BackgroundCheckInput,
  type ClearanceRequirementInput,
  type ListQuery,
  type VolunteerClearanceInput,
  type VolunteerTrainingInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import { hasPerm, type AuthenticatedUser } from '../../common/types';
import { ScreeningService } from './screening.service';

// backgroundCheckSchema carries a superRefine (cross-field date rule) —
// unwrap to the base object for PATCH.
const backgroundCheckUpdateSchema = backgroundCheckSchema.innerType().partial();

const checksQuerySchema = listQuerySchema.extend({ personId: uuid.optional() });
type ChecksQuery = z.infer<typeof checksQuerySchema>;

const trainingsQuerySchema = listQuerySchema.extend({ volunteerProfileId: uuid.optional() });
type TrainingsQuery = z.infer<typeof trainingsQuerySchema>;

const requirementsQuerySchema = listQuerySchema.extend({
  institutionId: uuid.optional(),
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
type RequirementsQuery = z.infer<typeof requirementsQuerySchema>;

const clearancesQuerySchema = listQuerySchema.extend({
  volunteerProfileId: uuid.optional(),
  requirementId: uuid.optional(),
  institutionId: uuid.optional(),
  status: z.enum(CLEARANCE_STATUSES).optional(),
});
type ClearancesQuery = z.infer<typeof clearancesQuerySchema>;

// Writing adjudication results requires the same field-class permission that
// gates reading them (§7.2) — volunteers.create/update alone is not enough.
@Controller('volunteers/background-checks')
export class BackgroundChecksController {
  constructor(private readonly screening: ScreeningService) {}

  @Get()
  @RequirePermission('volunteers.read')
  list(@Query(zodQuery(checksQuerySchema)) query: ChecksQuery, @CurrentUser() user: AuthenticatedUser) {
    const { personId, ...listQuery } = query;
    return this.screening.listChecks(
      listQuery as ListQuery,
      personId,
      hasPerm(user, 'fields.background_checks.read'),
    );
  }

  @Post()
  @RequirePermission('volunteers.create', 'fields.background_checks.read')
  create(
    @Body(zodBody(backgroundCheckSchema)) body: BackgroundCheckInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.screening.createCheck(body, user.id);
  }

  @Patch(':id')
  @RequirePermission('volunteers.update', 'fields.background_checks.read')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(backgroundCheckUpdateSchema)) body: Partial<BackgroundCheckInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.screening.updateCheck(id, body, user.id);
  }
}

@Controller('volunteers/trainings')
export class TrainingsController {
  constructor(private readonly screening: ScreeningService) {}

  @Get()
  @RequirePermission('volunteers.read')
  list(@Query(zodQuery(trainingsQuerySchema)) query: TrainingsQuery) {
    const { volunteerProfileId, ...listQuery } = query;
    return this.screening.listTrainings(listQuery as ListQuery, volunteerProfileId);
  }

  @Post()
  @RequirePermission('volunteers.create')
  create(
    @Body(zodBody(volunteerTrainingSchema)) body: VolunteerTrainingInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.screening.createTraining(body, user.id);
  }

  @Patch(':id')
  @RequirePermission('volunteers.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(volunteerTrainingSchema.partial())) body: Partial<VolunteerTrainingInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.screening.updateTraining(id, body, user.id);
  }

  @Delete(':id')
  @RequirePermission('volunteers.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.screening.deleteTraining(id, user.id);
  }
}

@Controller('volunteers/facility-requirements')
export class FacilityRequirementsController {
  constructor(private readonly screening: ScreeningService) {}

  @Get()
  @RequirePermission('volunteers.read')
  list(@Query(zodQuery(requirementsQuerySchema)) query: RequirementsQuery) {
    const { institutionId, active, ...listQuery } = query;
    return this.screening.listRequirements(listQuery as ListQuery, { institutionId, active });
  }

  @Post()
  @RequirePermission('volunteers.create')
  create(
    @Body(zodBody(clearanceRequirementSchema)) body: ClearanceRequirementInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.screening.createRequirement(body, user.id);
  }

  @Patch(':id')
  @RequirePermission('volunteers.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(clearanceRequirementSchema.partial())) body: Partial<ClearanceRequirementInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.screening.updateRequirement(id, body, user.id);
  }

  @Delete(':id')
  @RequirePermission('volunteers.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.screening.deleteRequirement(id, user.id);
  }
}

@Controller('volunteers/clearances')
export class ClearancesController {
  constructor(private readonly screening: ScreeningService) {}

  @Get()
  @RequirePermission('volunteers.read')
  list(@Query(zodQuery(clearancesQuerySchema)) query: ClearancesQuery) {
    const { volunteerProfileId, requirementId, institutionId, status, ...listQuery } = query;
    return this.screening.listClearances(listQuery as ListQuery, {
      volunteerProfileId,
      requirementId,
      institutionId,
      status,
    });
  }

  // Upsert: volunteerProfileId+requirementId is unique — re-posting a renewal
  // updates the existing row instead of returning 409.
  @Post()
  @RequirePermission('volunteers.create')
  upsert(
    @Body(zodBody(volunteerClearanceSchema)) body: VolunteerClearanceInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.screening.upsertClearance(body, user.id);
  }

  @Patch(':id')
  @RequirePermission('volunteers.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(volunteerClearanceSchema.partial())) body: Partial<VolunteerClearanceInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.screening.updateClearance(id, body, user.id);
  }

  @Delete(':id')
  @RequirePermission('volunteers.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.screening.deleteClearance(id, user.id);
  }
}
