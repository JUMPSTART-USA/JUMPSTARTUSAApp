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
  // External param stays `state`, but it filters the CHAPTER column (§7.2) —
  // the postal address state is not a list filter.
  state: z.enum(CHAPTER_STATES).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get()
  @RequirePermission('vendors.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { active, isReferralPartner, state, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.vendors.list(listQuery as ListQuery, {
      active,
      isReferralPartner,
      chapterState: (user.chapter ?? state) as ListFilters['state'],
    });
  }

  @Get(':id')
  @RequirePermission('vendors.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.vendors.get(id, user);
  }

  @Post()
  @RequirePermission('vendors.create')
  create(
    @Body(zodBody(vendorSchema)) body: VendorInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vendors.create(body, user);
  }

  @Patch(':id')
  @RequirePermission('vendors.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(vendorSchema.partial())) body: Partial<VendorInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vendors.update(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('vendors.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.vendors.softDelete(id, user);
  }
}
