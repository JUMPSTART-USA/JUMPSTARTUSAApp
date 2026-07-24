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
  EMPLOYMENT_STATUSES,
  employmentSchema,
  listQuerySchema,
  uuid,
  type EmploymentInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { EmploymentsService } from './employments.service';

const listFiltersSchema = listQuerySchema.extend({
  participantProfileId: uuid.optional(),
  employerId: uuid.optional(),
  status: z.enum(EMPLOYMENT_STATUSES).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

// employmentSchema is wrapped by two cross-field superRefines (ZodEffects has
// no .partial()), so unwrap to the base object for PATCH. The cross-record
// rules those refinements cover are enforced in the service.
const employmentPatchSchema = employmentSchema.innerType().innerType().partial();

@Controller('employments')
export class EmploymentsController {
  constructor(private readonly employments: EmploymentsService) {}

  @Get()
  @RequirePermission('employment.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { participantProfileId, employerId, status, ...listQuery } = query;
    return this.employments.list(
      listQuery as ListQuery,
      { participantProfileId, employerId, status },
      user,
    );
  }

  @Get(':id')
  @RequirePermission('employment.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.employments.get(id, user);
  }

  @Post()
  @RequirePermission('employment.create')
  create(
    @Body(zodBody(employmentSchema)) body: EmploymentInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employments.create(body, user);
  }

  @Patch(':id')
  @RequirePermission('employment.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(employmentPatchSchema)) body: Partial<EmploymentInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employments.update(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('employment.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.employments.softDelete(id, user);
  }
}
