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
  budgetItemSchema,
  budgetPaymentSchema,
  CHAPTER_STATES,
  endNotBeforeStart,
  listQuerySchema,
  uuid,
  type BudgetItemInput,
  type BudgetPaymentInput,
  type ListQuery,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import {
  BudgetsService,
  type BudgetItemUpdateInput,
  type BudgetPaymentUpdateInput,
} from './budgets.service';

// Both create schemas are ZodEffects (date refinements), so partial update
// schemas come from innerType() with the refinement re-applied — the same
// pattern drug-tests uses.
const budgetItemUpdateSchema = budgetItemSchema
  .innerType()
  .partial()
  .superRefine(endNotBeforeStart('startDate', 'endDate'));

const notFuturePaidDate = (val: { paidDate?: Date }, ctx: z.RefinementCtx) => {
  if (val.paidDate && val.paidDate > new Date()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Payment date cannot be in the future',
      path: ['paidDate'],
    });
  }
};
const budgetPaymentUpdateSchema = budgetPaymentSchema
  .innerType()
  .partial()
  .superRefine(notFuturePaidDate);

// Budgets are always viewed per participant, so the item list requires one.
const itemListFiltersSchema = z.object({ participantProfileId: uuid });
type ItemListFilters = z.infer<typeof itemListFiltersSchema>;

const paymentListFiltersSchema = listQuerySchema.extend({
  participantProfileId: uuid.optional(),
  budgetItemId: uuid.optional(),
  state: z.enum(CHAPTER_STATES).optional(),
});
type PaymentListFilters = z.infer<typeof paymentListFiltersSchema>;

@Controller('budget-items')
export class BudgetItemsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  @RequirePermission('case_management.read')
  list(
    @Query(zodQuery(itemListFiltersSchema)) query: ItemListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.budgets.listItems(query.participantProfileId, user);
  }

  @Post()
  @RequirePermission('case_management.create')
  create(
    @Body(zodBody(budgetItemSchema)) body: BudgetItemInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.budgets.createItem(body, user);
  }

  @Patch(':id')
  @RequirePermission('case_management.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(budgetItemUpdateSchema)) body: BudgetItemUpdateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.budgets.updateItem(id, body, user);
  }

  // Soft delete — the item's payment history is preserved on purpose.
  @Delete(':id')
  @RequirePermission('case_management.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.budgets.softDeleteItem(id, user);
  }
}

@Controller('budget-payments')
export class BudgetPaymentsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  @RequirePermission('case_management.read')
  list(
    @Query(zodQuery(paymentListFiltersSchema)) query: PaymentListFilters,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { participantProfileId, budgetItemId, state, ...listQuery } = query;
    // Chapter scoping (§7.2): scoped users always see their own chapter.
    return this.budgets.listPayments(listQuery as ListQuery, {
      participantProfileId,
      budgetItemId,
      state: user.chapter ?? state,
    });
  }

  // participantProfileId is derived server-side from the budget item.
  @Post()
  @RequirePermission('case_management.create')
  create(
    @Body(zodBody(budgetPaymentSchema)) body: BudgetPaymentInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.budgets.createPayment(body, user);
  }

  @Patch(':id')
  @RequirePermission('case_management.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(budgetPaymentUpdateSchema)) body: BudgetPaymentUpdateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.budgets.updatePayment(id, body, user);
  }

  @Delete(':id')
  @RequirePermission('case_management.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.budgets.softDeletePayment(id, user);
  }
}
