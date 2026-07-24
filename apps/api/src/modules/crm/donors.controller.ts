import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  donorSchema,
  DONOR_TYPES,
  listQuerySchema,
  type DonorInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { DonorsService, type DonorLocalUpdate } from './donors.service';

const listFiltersSchema = listQuerySchema.extend({
  donorType: z.enum(DONOR_TYPES).optional(),
  status: z.enum(['active', 'lapsed', 'inactive']).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

// PATCH accepts LOCAL fields only — Bloomerang owns the rest (§6.8).
const donorLocalUpdateSchema = donorSchema.pick({ personId: true, notes: true }).partial();

@Controller('donors')
export class DonorsController {
  constructor(private readonly donors: DonorsService) {}

  @Get()
  @RequirePermission('donors.read')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { donorType, status, ...listQuery } = query;
    return this.donors.list(listQuery as ListQuery, { donorType, status });
  }

  @Get(':id')
  @RequirePermission('donors.read')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.donors.detail(id);
  }

  // Manual entry path (historical import fixes) — admin-only in practice.
  @Post()
  @RequirePermission('donors.create')
  create(
    @Body(zodBody(donorSchema)) body: DonorInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.donors.create(body, user.id);
  }

  @Patch(':id')
  @RequirePermission('donors.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(donorLocalUpdateSchema)) body: DonorLocalUpdate,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.donors.updateLocal(id, body, user.id);
  }
}
