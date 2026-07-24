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
  listQuerySchema,
  maintenanceRecordSchema,
  optionalDate,
  uuid,
  vehicleSchema,
  type ListQuery,
  type MaintenanceRecordInput,
  type VehicleInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { VehiclesService } from './vehicles.service';

const listFiltersSchema = listQuerySchema.extend({
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  assignedLocation: z.string().trim().max(200).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

const summaryQuerySchema = z.object({
  vehicleId: uuid.optional(),
  from: optionalDate,
  to: optionalDate,
});
type SummaryQuery = z.infer<typeof summaryQuerySchema>;

// Static paths (alerts, maintenance/*) are declared before ':id' routes so the
// router never tries to parse them as UUIDs.
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  @RequirePermission('vehicles.read')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { active, assignedLocation, ...listQuery } = query;
    return this.vehicles.list(listQuery as ListQuery, { active, assignedLocation });
  }

  @Get('alerts')
  @RequirePermission('vehicles.read')
  alerts() {
    return this.vehicles.alerts();
  }

  @Get('maintenance/summary')
  @RequirePermission('vehicles.read')
  maintenanceSummary(@Query(zodQuery(summaryQuerySchema)) query: SummaryQuery) {
    return this.vehicles.maintenanceSummary(query);
  }

  @Get('maintenance/:id')
  @RequirePermission('vehicles.read')
  getMaintenance(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicles.getMaintenance(id);
  }

  @Post('maintenance')
  @RequirePermission('vehicles.create')
  createMaintenance(
    @Body(zodBody(maintenanceRecordSchema)) body: MaintenanceRecordInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehicles.createMaintenance(body, user.id);
  }

  @Patch('maintenance/:id')
  @RequirePermission('vehicles.update')
  updateMaintenance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(maintenanceRecordSchema.partial())) body: Partial<MaintenanceRecordInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehicles.updateMaintenance(id, body, user.id);
  }

  @Delete('maintenance/:id')
  @RequirePermission('vehicles.delete')
  removeMaintenance(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.vehicles.deleteMaintenance(id, user.id);
  }

  @Get(':id')
  @RequirePermission('vehicles.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicles.get(id);
  }

  @Get(':id/profile')
  @RequirePermission('vehicles.read')
  profile(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicles.profile(id);
  }

  @Post()
  @RequirePermission('vehicles.create')
  create(
    @Body(zodBody(vehicleSchema)) body: VehicleInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehicles.create(body, user.id);
  }

  @Patch(':id')
  @RequirePermission('vehicles.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(vehicleSchema.partial())) body: Partial<VehicleInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehicles.update(id, body, user.id);
  }

  @Delete(':id')
  @RequirePermission('vehicles.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.vehicles.softDelete(id, user.id);
  }
}
