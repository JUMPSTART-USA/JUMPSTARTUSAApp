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
  vendorSchema,
  type ListQuery,
  type VendorInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { VendorsService } from './vendors.service';

const boolParam = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

const listFiltersSchema = listQuerySchema.extend({
  active: boolParam,
  isReferralPartner: boolParam,
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get()
  @RequirePermission('vendors.read')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { active, isReferralPartner, ...listQuery } = query;
    return this.vendors.list(listQuery as ListQuery, { active, isReferralPartner });
  }

  @Get(':id')
  @RequirePermission('vendors.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendors.get(id);
  }

  @Post()
  @RequirePermission('vendors.create')
  create(
    @Body(zodBody(vendorSchema)) body: VendorInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vendors.create(body, user.id);
  }

  @Patch(':id')
  @RequirePermission('vendors.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(vendorSchema.partial())) body: Partial<VendorInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vendors.update(id, body, user.id);
  }

  @Delete(':id')
  @RequirePermission('vendors.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.vendors.softDelete(id, user.id);
  }
}
