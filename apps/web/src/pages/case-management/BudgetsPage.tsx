import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { BUDGET_CATEGORY_LABELS, BUDGET_FREQUENCY_LABELS } from '@jumpstart/shared';
import { DataTable, type Column } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ListToolbar } from '@/components/ui/toolbar';
import { ParticipantPicker, useParticipantOption, type PickerOption } from '@/components/pickers';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { P, useListParams } from '@/lib/list-params';
import { formatDate, formatMoney } from '@/lib/utils';
import {
  BudgetItemFormDialog,
  BudgetPaymentFormDialog,
  DeleteBudgetItemDialog,
  DeleteBudgetPaymentDialog,
  budgetItemLabel,
  type BudgetItemView,
  type BudgetPaymentRow,
} from './budget-dialogs';

export type { BudgetItemView, BudgetPaymentRow } from './budget-dialogs';

/**
 * Participant budgets (§6.6): recurring obligations (budget items) and the
 * payments recorded against them. The whole module is per-participant — the
 * page requires a picker selection before showing anything.
 */

const MONTHLY_FACTORS: Record<string, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
};

/** Client-side monthly equivalent over active, non-one_time items. */
export function monthlyEquivalent(items: BudgetItemView[]): number {
  return items.reduce((sum, item) => {
    const factor = MONTHLY_FACTORS[item.frequency];
    if (!item.active || !factor) return sum;
    const amount = Number(item.amount);
    return Number.isNaN(amount) ? sum : sum + amount * factor;
  }, 0);
}


export function BudgetsPage() {
  const { can } = useAuth();
  const canCreate = can('case_management.create');
  const canUpdate = can('case_management.update');
  const canDelete = can('case_management.delete');
  /**
   * The participant is not a filter here — it IS the page. Without one there is
   * nothing to show, so putting it in the URL is what makes a participant's
   * budget linkable at all: `?participantId=…` reopens the same budget rather
   * than an empty state with a prompt to search again.
   *
   * NO namespace: the budget-items card above is unpaginated, so the payments
   * table is the only thing on this route that pages and a bare ?page= cannot
   * collide with anything. (Namespacing it also pushed the participant itself to
   * `?payments.participantId=`, which reads as a property of the payments table
   * rather than of the page.)
   */
  const { values, set, listState: payState, onListStateChange: setPayState, clear, isFiltered } = useListParams(
    { participantId: P.id() },
    { sort: { by: 'paidDate', dir: 'desc' } },
  );
  const participant = useParticipantOption(values.participantId);
  const [itemDialog, setItemDialog] = useState<BudgetItemView | 'new' | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<BudgetPaymentRow | 'new' | null>(null);
  const [deleteItem, setDeleteItem] = useState<BudgetItemView | null>(null);
  const [deletePayment, setDeletePayment] = useState<BudgetPaymentRow | null>(null);

  const itemsQuery = useQuery({
    queryKey: ['case-management', 'budgets', 'items', values.participantId],
    queryFn: () =>
      api.get<{ items: BudgetItemView[] }>(
        `/budget-items${qs({ participantProfileId: values.participantId })}`,
      ),
    enabled: !!values.participantId,
  });

  const payParams = qs({
    page: payState.page,
    pageSize: payState.pageSize,
    sortBy: payState.sortBy,
    sortDir: payState.sortDir,
    participantProfileId: values.participantId,
  });
  const paymentsQuery = useQuery({
    queryKey: ['case-management', 'budgets', 'payments', payParams],
    queryFn: () => api.get<Paged<BudgetPaymentRow>>(`/budget-payments${payParams}`),
    enabled: !!values.participantId,
    // Rows stay put through a page change; DataTable dims them.
    placeholderData: keepPreviousData,
  });

  const items = itemsQuery.data?.items ?? [];
  const hasItemActions = canUpdate || canDelete;

  const paymentColumns: Column<BudgetPaymentRow>[] = [
    {
      key: 'paidDate',
      header: 'Date',
      sortKey: 'paidDate',
      render: (p) => formatDate(p.paidDate),
      className: 'whitespace-nowrap',
    },
    {
      key: 'item',
      header: 'Item',
      render: (p) => (
        <div className="max-w-xs truncate font-medium" title={budgetItemLabel(p.budgetItem)}>
          {budgetItemLabel(p.budgetItem)}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      sortKey: 'amount',
      render: (p) => formatMoney(p.amount),
      className: 'whitespace-nowrap text-right tabular-nums',
    },
    {
      key: 'method',
      header: 'Method',
      sortKey: 'method',
      render: (p) => p.method ?? '—',
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (p) =>
        p.notes ? <div className="max-w-xs truncate text-muted-foreground">{p.notes}</div> : '—',
    },
    ...(canUpdate || canDelete
      ? [
          {
            key: 'actions',
            header: '',
            className: 'w-20',
            render: (p: BudgetPaymentRow) => (
              <span className="flex justify-end">
                {canUpdate ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Edit payment"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPaymentDialog(p);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
                {canDelete ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    aria-label="Delete payment"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletePayment(p);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </span>
            ),
          } satisfies Column<BudgetPaymentRow>,
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Budgets"
        actions={
          canCreate && participant ? (
            <Button onClick={() => setItemDialog('new')}>
              <Plus className="h-4 w-4" /> Add budget item
            </Button>
          ) : null
        }
      />

      <ListToolbar className="items-end">
        <div className="w-full sm:w-72">
          {/* Changing participant deletes the payments page key in the same
              write, so the old page 3 cannot survive into a shorter budget. */}
          <ParticipantPicker
            {...participant}
            onChange={(p) => set('participantId', p?.id ?? '')}
          />
        </div>
      </ListToolbar>

      {!values.participantId ? (
        <EmptyState title="Select a participant to view their budget" />
      ) : (
        <>
          <Card>
            <CardHeaderRow
              title="Budget items"
              description={`Monthly equivalent: ${formatMoney(monthlyEquivalent(items))}`}
            >
              {canCreate ? (
                <Button variant="outline" size="sm" onClick={() => setPaymentDialog('new')}>
                  <Plus className="h-3.5 w-3.5" /> Record payment
                </Button>
              ) : null}
            </CardHeaderRow>
            <CardContent>
              {itemsQuery.isLoading ? (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              ) : itemsQuery.error ? (
                <ErrorState error={itemsQuery.error} onRetry={itemsQuery.refetch} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>End</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead>Last paid</TableHead>
                      <TableHead>Total paid</TableHead>
                      {hasItemActions ? <TableHead className="w-20" /> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={hasItemActions ? 10 : 9}
                          className="h-24 text-center text-muted-foreground"
                        >
                          No budget items
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            <div className="max-w-xs truncate" title={BUDGET_CATEGORY_LABELS[item.category]}>
                              {BUDGET_CATEGORY_LABELS[item.category]}
                            </div>
                          </TableCell>
                          <TableCell>{item.label ?? '—'}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatMoney(item.amount)}
                          </TableCell>
                          <TableCell>{BUDGET_FREQUENCY_LABELS[item.frequency]}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatDate(item.startDate)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatDate(item.endDate)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={item.active ? 'active' : 'inactive'} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatDate(item.lastPaidDate)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatMoney(item.totalPaid)}
                          </TableCell>
                          {hasItemActions ? (
                            <TableCell>
                              <span className="flex justify-end">
                                {canUpdate ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    aria-label="Edit budget item"
                                    onClick={() => setItemDialog(item)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                ) : null}
                                {canDelete ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive"
                                    aria-label="Delete budget item"
                                    onClick={() => setDeleteItem(item)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                ) : null}
                              </span>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeaderRow title="Payments" />
            <CardContent>
              {paymentsQuery.error ? <ErrorState error={paymentsQuery.error} onRetry={paymentsQuery.refetch} /> : null}
              <DataTable
                columns={paymentColumns}
                data={paymentsQuery.data}
                isLoading={paymentsQuery.isLoading}
                isFetching={paymentsQuery.isFetching}
                state={payState}
                onStateChange={setPayState}
                isFiltered={isFiltered}
                onClearFilters={clear}
                emptyMessage="No payments recorded"
              />
            </CardContent>
          </Card>
        </>
      )}

      <BudgetItemFormDialog
        item={itemDialog}
        participant={participant.value}
        onClose={() => setItemDialog(null)}
      />
      <BudgetPaymentFormDialog
        payment={paymentDialog}
        participantId={values.participantId || null}
        onClose={() => setPaymentDialog(null)}
      />
      <DeleteBudgetItemDialog item={deleteItem} onClose={() => setDeleteItem(null)} />
      <DeleteBudgetPaymentDialog payment={deletePayment} onClose={() => setDeletePayment(null)} />
    </div>
  );
}

/**
 * Compact budget card for the participant profile's Case Management tab:
 * active items mini-table, monthly-equivalent line, last 5 payments, and the
 * add/record actions reusing the module dialogs. Dropped in by the main
 * session as <BudgetCard participantId={...} />.
 */
export function BudgetCard({ participantId }: { participantId: string }) {
  const { can } = useAuth();
  const canCreate = can('case_management.create');
  const [itemDialog, setItemDialog] = useState<BudgetItemView | 'new' | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<BudgetPaymentRow | 'new' | null>(null);

  const itemsQuery = useQuery({
    queryKey: ['participants', participantId, 'budget-items'],
    queryFn: () =>
      api.get<{ items: BudgetItemView[] }>(
        `/budget-items${qs({ participantProfileId: participantId })}`,
      ),
  });
  const paymentsQuery = useQuery({
    queryKey: ['participants', participantId, 'budget-payments'],
    queryFn: () =>
      api.get<Paged<BudgetPaymentRow>>(
        `/budget-payments${qs({
          participantProfileId: participantId,
          pageSize: 5,
          sortBy: 'paidDate',
          sortDir: 'desc',
        })}`,
      ),
  });

  const items = itemsQuery.data?.items ?? [];
  const activeItems = items.filter((i) => i.active);
  const payments = paymentsQuery.data?.items ?? [];

  return (
    <Card>
      <CardHeaderRow
        title="Budget"
        description={`Monthly equivalent: ${formatMoney(monthlyEquivalent(items))}`}
      >
        {canCreate ? (
          <>
            <Button variant="outline" size="sm" onClick={() => setItemDialog('new')}>
              <Plus className="h-3.5 w-3.5" /> Add item
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPaymentDialog('new')}>
              <Plus className="h-3.5 w-3.5" /> Record payment
            </Button>
          </>
        ) : null}
      </CardHeaderRow>
      <CardContent className="space-y-4">
        {itemsQuery.isLoading || paymentsQuery.isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : itemsQuery.error ? (
          <ErrorState error={itemsQuery.error} onRetry={itemsQuery.refetch} />
        ) : paymentsQuery.error ? (
          <ErrorState error={paymentsQuery.error} onRetry={paymentsQuery.refetch} />
        ) : (
          <>
            {activeItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active budget items</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Last paid</TableHead>
                    <TableHead>Total paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        <div className="max-w-xs truncate" title={budgetItemLabel(item)}>
                          {budgetItemLabel(item)}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatMoney(item.amount)}
                      </TableCell>
                      <TableCell>{BUDGET_FREQUENCY_LABELS[item.frequency]}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(item.lastPaidDate)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatMoney(item.totalPaid)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recent payments
              </h4>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments recorded</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(p.paidDate)}
                        </TableCell>
                        <TableCell>
                          <div className="max-w-xs truncate" title={budgetItemLabel(p.budgetItem)}>
                            {budgetItemLabel(p.budgetItem)}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatMoney(p.amount)}</TableCell>
                        <TableCell>{p.method ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        )}
      </CardContent>
      <BudgetItemFormDialog
        item={itemDialog}
        participant={{ id: participantId, label: '' }}
        onClose={() => setItemDialog(null)}
      />
      <BudgetPaymentFormDialog
        payment={paymentDialog}
        participantId={participantId}
        onClose={() => setPaymentDialog(null)}
      />
    </Card>
  );
}
