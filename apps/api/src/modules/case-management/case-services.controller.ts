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
  CHAPTER_STATES,
  caseServiceSchema,
  listQuerySchema,
  optionalDate,
  uuid,
  type CaseServiceInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { CaseServicesService } from './case-services.service';

const listFiltersSchema = listQuerySchema.extend({
  participantProfileId: uuid.optional(),
  serviceType: z.string().trim().max(100).optional(),
  from: optionalDate,
  to: optionalDate,
  state: z.enum(CHAPTER_STATES).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('case-services')
export class CaseServicesController {
  constructor(private readonly services: CaseServicesService) {}

  @Get()
  @RequirePermission('case_management.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { participantProfileId, serviceType, from, to, state, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.services.list(listQuery as ListQuery, {
      participantProfileId,
      serviceType,
      from,
      to,
      state: user.chapter ?? state,
    });
  }

  // Literal route before ':id'. The service menu: admin-overridable via the
  // `services.types` app setting, defaulting to the standard reentry list.
  @Get('types')
  @RequirePermission('case_management.read')
  types() {
    return this.services.serviceTypes();
  }

  @Get(':id')
  @RequirePermission('case_management.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.services.get(id, user);
  }

  @Post()
  @RequirePermission('case_management.create')
  create(
    @Body(zodBody(caseServiceSchema)) body: CaseServiceInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.services.create(body, user);
  }

  @Patch(':id')
  @RequirePermission('case_management.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(caseServiceSchema.partial())) body: Partial<CaseServiceInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.services.update(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('case_management.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.services.softDelete(id, user);
  }
}
