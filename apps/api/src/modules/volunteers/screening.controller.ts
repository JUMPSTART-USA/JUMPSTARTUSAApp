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
// unwrap to the base object for PATCH. personId is create-only: a recorded
// check can never be repointed to another person.
const backgroundCheckUpdateSchema = backgroundCheckSchema
  .innerType()
  .omit({ personId: true })
  .partial();

// FK fields are create-only on PATCH for the same reason (clearance renewals
// go through the POST upsert).
const trainingUpdateSchema = volunteerTrainingSchema.omit({ volunteerProfileId: true }).partial();
const clearanceUpdateSchema = volunteerClearanceSchema
  .omit({ volunteerProfileId: true, requirementId: true })
  .partial();

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
      user.chapter,
    );
  }

  @Post()
  @RequirePermission('volunteers.create', 'fields.background_checks.read')
  create(
    @Body(zodBody(backgroundCheckSchema)) body: BackgroundCheckInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.screening.createCheck(body, user);
  }

  @Patch(':id')
  @RequirePermission('volunteers.update', 'fields.background_checks.read')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(backgroundCheckUpdateSchema)) body: Partial<Omit<BackgroundCheckInput, 'personId'>>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.screening.updateCheck(id, body, user);
  }
}

@Controller('volunteers/trainings')
export class TrainingsController {
  constructor(private readonly screening: ScreeningService) {}

  @Get()
  @RequirePermission('volunteers.read')
  list(
    @Query(zodQuery(trainingsQuerySchema)) query: TrainingsQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { volunteerProfileId, ...listQuery } = query;
    return this.screening.listTrainings(listQuery as ListQuery, volunteerProfileId, user.chapter);
  }

  @Post()
  @RequirePermission('volunteers.create')
  create(
    @Body(zodBody(volunteerTrainingSchema)) body: VolunteerTrainingInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.screening.createTraining(body, user);
  }

  @Patch(':id')
  @RequirePermission('volunteers.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(trainingUpdateSchema))
    body: Partial<Omit<VolunteerTrainingInput, 'volunteerProfileId'>>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.screening.updateTraining(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('volunteers.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.screening.deleteTraining(id, user);
  }
}

@Controller('volunteers/facility-requirements')
export class FacilityRequirementsController {
  constructor(private readonly screening: ScreeningService) {}

  @Get()
  @RequirePermission('volunteers.read')
  list(
    @Query(zodQuery(requirementsQuerySchema)) query: RequirementsQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { institutionId, active, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users only see their chapter's facilities.
    return this.screening.listRequirements(
      listQuery as ListQuery,
      { institutionId, active },
      user.chapter,
    );
  }

  @Post()
  @RequirePermission('volunteers.create')
  create(
    @Body(zodBody(clearanceRequirementSchema)) body: ClearanceRequirementInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.screening.createRequirement(body, user);
  }

  @Patch(':id')
  @RequirePermission('volunteers.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(clearanceRequirementSchema.partial())) body: Partial<ClearanceRequirementInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.screening.updateRequirement(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('volunteers.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.screening.deleteRequirement(id, user);
  }
}

@Controller('volunteers/clearances')
export class ClearancesController {
  constructor(private readonly screening: ScreeningService) {}

  @Get()
  @RequirePermission('volunteers.read')
  list(
    @Query(zodQuery(clearancesQuerySchema)) query: ClearancesQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { volunteerProfileId, requirementId, institutionId, status, ...listQuery } = query;
    return this.screening.listClearances(
      listQuery as ListQuery,
      {
        volunteerProfileId,
        requirementId,
        institutionId,
        status,
      },
      user.chapter,
    );
  }

  // Upsert: volunteerProfileId+requirementId is unique — re-posting a renewal
  // updates the existing row instead of returning 409.
  @Post()
  @RequirePermission('volunteers.create')
  upsert(
    @Body(zodBody(volunteerClearanceSchema)) body: VolunteerClearanceInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.screening.upsertClearance(body, user);
  }

  @Patch(':id')
  @RequirePermission('volunteers.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(clearanceUpdateSchema))
    body: Partial<Omit<VolunteerClearanceInput, 'volunteerProfileId' | 'requirementId'>>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.screening.updateClearance(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('volunteers.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.screening.deleteClearance(id, user);
  }
}
