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
import { fundSchema, listQuerySchema, type FundInput, type ListQuery } from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { FundsService } from './funds.service';

const listFiltersSchema = listQuerySchema.extend({
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('funds')
export class FundsController {
  constructor(private readonly funds: FundsService) {}

  @Get()
  @RequirePermission('donors.read')
  list(
    @Query(zodQuery(listFiltersSchema)) query: ListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { active, ...listQuery } = query;
    // Funds are org-global (§7.2) — user only scopes the giving rollups.
    return this.funds.list(listQuery as ListQuery, { active }, user);
  }

  @Post()
  @RequirePermission('donors.create')
  create(
    @Body(zodBody(fundSchema)) body: FundInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.funds.create(body, user.id);
  }

  @Patch(':id')
  @RequirePermission('donors.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(fundSchema.partial())) body: Partial<FundInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.funds.update(id, body, user.id);
  }

  @Delete(':id')
  @RequirePermission('donors.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.funds.remove(id, user.id);
  }
}
