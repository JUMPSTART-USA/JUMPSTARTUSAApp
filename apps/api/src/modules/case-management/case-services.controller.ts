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
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('case-services')
export class CaseServicesController {
  constructor(private readonly services: CaseServicesService) {}

  @Get()
  @RequirePermission('case_management.read')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { participantProfileId, serviceType, from, to, ...listQuery } = query;
    return this.services.list(listQuery as ListQuery, { participantProfileId, serviceType, from, to });
  }

  @Get(':id')
  @RequirePermission('case_management.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.services.get(id);
  }

  @Post()
  @RequirePermission('case_management.create')
  create(
    @Body(zodBody(caseServiceSchema)) body: CaseServiceInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.services.create(body, user.id);
  }

  @Patch(':id')
  @RequirePermission('case_management.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(caseServiceSchema.partial())) body: Partial<CaseServiceInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.services.update(id, body, user.id);
  }

  @Delete(':id')
  @RequirePermission('case_management.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.services.softDelete(id, user.id);
  }
}
