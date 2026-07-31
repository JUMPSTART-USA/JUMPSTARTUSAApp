import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  BUDGET_CATEGORIES,
  BUDGET_CATEGORY_LABELS,
  BUDGET_FREQUENCIES,
  BUDGET_FREQUENCY_LABELS,
  budgetItemSchema,
  budgetPaymentSchema,
  endNotBeforeStart,
  type BudgetCategory,
  type BudgetFrequency,
} from '@jumpstart/shared';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { type PickerOption } from '@/components/pickers';
import { api, qs } from '@/lib/api';
import { applyApiError, formResolver, toDateInput, todayInput } from '@/lib/form';
import { formatDate, formatMoney } from '@/lib/utils';

/**
 * Dialogs for the participant-budgets module (§6.6): recurring obligations
 * (budget items) and the payments recorded against them. Both form dialogs are
 * fixed-participant — the page/profile card owns the participant selection and
 * passes it in; the dialogs never embed a picker.
 */

// ── Response shapes (JSON-serialized Prisma rows from /budget-items|payments) ─
// Amounts are Prisma Decimals, which serialize to JSON strings — keep them as
// strings and render with formatMoney.

export interface BudgetItemView {
  id: string;
  participantProfileId: string;
  category: BudgetCategory;
  label: string | null;
  amount: string;
  frequency: BudgetFrequency;
  startDate: string;
  endDate: string | null;
  active: boolean;
  notes: string | null;
  lastPaidDate: string | null;
  totalPaid: string;
}

export interface BudgetPaymentRow {
  id: string;
  budgetItemId: string;
  participantProfileId: string;
  paidDate: string;
  amount: string;
  method: string | null;
  notes: string | null;
  createdAt: string;
  budgetItem: { id: string; category: BudgetCategory; label: string | null };
}

/** "Rent — Oak Street apartment" or just the category label. */
export function budgetItemLabel(item: { category: BudgetCategory; label: string | null }): string {
  const category = BUDGET_CATEGORY_LABELS[item.category];
  return item.label ? `${category} — ${item.label}` : category;
}

function invalidateBudgets(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['case-management'] });
  queryClient.invalidateQueries({ queryKey: ['participants'] });
}

// ── Budget item form ─────────────────────────────────────────────────────────

// The form never carries participantProfileId (it's fixed by the caller), so
// validate against the schema minus that field, refinement re-applied.
const budgetItemFormSchema = budgetItemSchema
  .innerType()
  .omit({ participantProfileId: true })
  .superRefine(endNotBeforeStart('startDate', 'endDate'));

interface BudgetItemFormValues {
  category: string;
  label: string;
  amount: string;
  frequency: string;
  startDate: string;
  endDate: string;
  active: boolean;
  notes: string;
}

export function BudgetItemFormDialog({
  item,
  participant,
  onClose,
}: {
  /** 'new' opens the dialog in create mode. */
  item: BudgetItemView | 'new' | null;
  /** Fixed participant (page selection / profile card). label '' hides the row. */
  participant: PickerOption | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState('');
  const creating = item === 'new';
  const existing = item !== 'new' ? item : null;

  const { register, handleSubmit, getValues, setError, reset, formState } =
    useForm<BudgetItemFormValues>({ resolver: formResolver(budgetItemFormSchema) });

  useEffect(() => {
    if (item) {
      setTopError('');
      reset({
        category: existing?.category ?? '',
        label: existing?.label ?? '',
        amount: existing?.amount ?? '',
        frequency: existing?.frequency ?? '',
        startDate: existing ? toDateInput(existing.startDate) : todayInput(),
        endDate: existing?.endDate ? toDateInput(existing.endDate) : '',
        active: existing?.active ?? true,
        notes: existing?.notes ?? '',
      });
    }
  }, [item, reset]);

  const save = useMutation({
    mutationFn: () => {
      // The resolver parses dates to Date objects; the API expects the raw
      // yyyy-mm-dd strings, so the payload is built from raw values.
      const raw = getValues();
      const payload = {
        ...(creating ? { participantProfileId: participant?.id } : {}),
        category: raw.category,
        label: raw.label.trim() || undefined,
        amount: raw.amount,
        frequency: raw.frequency,
        startDate: raw.startDate,
        endDate: raw.endDate || undefined,
        active: raw.active,
        notes: raw.notes.trim() || undefined,
      };
      return creating
        ? api.post<BudgetItemView>('/budget-items', payload)
        : api.patch<BudgetItemView>(`/budget-items/${existing?.id}`, payload);
    },
    onSuccess: () => {
      invalidateBudgets(queryClient);
      onClose();
    },
    onError: (err) => setTopError(applyApiError(err, setError) ?? ''),
  });

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{creating ? 'Add budget item' : 'Edit budget item'}</DialogTitle>
          <DialogDescription>
            {creating
              ? 'Add a recurring obligation or one-time expense to this participant’s budget.'
              : 'Update this budget item.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit(() => {
            if (creating && !participant) {
              setTopError('Select a participant first.');
              return;
            }
            setTopError('');
            save.mutate();
          })}
        >
          {creating && participant?.label ? (
            <FormField label="Participant">
              <Input value={participant.label} disabled readOnly />
            </FormField>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Category" required error={formState.errors.category}>
              <Select {...register('category')}>
                <option value="">Select…</option>
                {BUDGET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {BUDGET_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Label" error={formState.errors.label} hint="Optional — e.g. landlord or agency name.">
              <Input {...register('label')} />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Amount" required error={formState.errors.amount}>
              <Input type="number" step="0.01" min="0" inputMode="decimal" {...register('amount')} />
            </FormField>
            <FormField label="Frequency" required error={formState.errors.frequency}>
              <Select {...register('frequency')}>
                <option value="">Select…</option>
                {BUDGET_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {BUDGET_FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Start date" required error={formState.errors.startDate}>
              <Input type="date" {...register('startDate')} />
            </FormField>
            <FormField label="End date" error={formState.errors.endDate}>
              <Input type="date" {...register('endDate')} />
            </FormField>
          </div>
          <Label className="flex items-center gap-2">
            <Checkbox {...register('active')} /> Active
          </Label>
          <FormField label="Notes" error={formState.errors.notes}>
            <Textarea rows={3} {...register('notes')} />
          </FormField>
          <FormError message={topError} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={formState.isSubmitting || save.isPending}>
              {save.isPending ? 'Saving…' : creating ? 'Create' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Budget payment form ──────────────────────────────────────────────────────

interface BudgetPaymentFormValues {
  budgetItemId: string;
  paidDate: string;
  amount: string;
  method: string;
  notes: string;
}

export function BudgetPaymentFormDialog({
  payment,
  participantId,
  onClose,
}: {
  /** 'new' opens the dialog in create mode. */
  payment: BudgetPaymentRow | 'new' | null;
  /** Whose active budget items populate the item select. */
  participantId: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState('');
  const creating = payment === 'new';
  const existing = payment !== 'new' ? payment : null;

  // budgetPaymentSchema covers exactly the form fields (participantProfileId
  // is derived server-side from the item).
  const { register, handleSubmit, getValues, setError, reset, formState } =
    useForm<BudgetPaymentFormValues>({ resolver: formResolver(budgetPaymentSchema) });

  const itemsQuery = useQuery({
    queryKey: ['case-management', 'budgets', 'items', participantId],
    queryFn: () =>
      api.get<{ items: BudgetItemView[] }>(
        `/budget-items${qs({ participantProfileId: participantId })}`,
      ),
    enabled: payment !== null && !!participantId,
  });
  const activeItems = (itemsQuery.data?.items ?? []).filter((i) => i.active);
  // When editing a payment whose item is now inactive (or soft-deleted), keep
  // it selectable so the select doesn't silently show the wrong value.
  const options =
    existing && !activeItems.some((i) => i.id === existing.budgetItemId)
      ? [existing.budgetItem, ...activeItems]
      : activeItems;

  useEffect(() => {
    if (payment) {
      setTopError('');
      reset({
        budgetItemId: existing?.budgetItemId ?? '',
        paidDate: existing ? toDateInput(existing.paidDate) : todayInput(),
        amount: existing?.amount ?? '',
        method: existing?.method ?? '',
        notes: existing?.notes ?? '',
      });
    }
  }, [payment, reset]);

  const save = useMutation({
    mutationFn: () => {
      const raw = getValues();
      const payload = {
        budgetItemId: raw.budgetItemId,
        paidDate: raw.paidDate,
        amount: raw.amount,
        method: raw.method.trim() || undefined,
        notes: raw.notes.trim() || undefined,
      };
      return creating
        ? api.post<BudgetPaymentRow>('/budget-payments', payload)
        : api.patch<BudgetPaymentRow>(`/budget-payments/${existing?.id}`, payload);
    },
    onSuccess: () => {
      invalidateBudgets(queryClient);
      onClose();
    },
    onError: (err) => setTopError(applyApiError(err, setError) ?? ''),
  });

  return (
    <Dialog open={payment !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{creating ? 'Record payment' : 'Edit payment'}</DialogTitle>
          <DialogDescription>
            {creating
              ? 'Record a payment against one of this participant’s budget items.'
              : 'Update this payment record.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit(() => {
            setTopError('');
            save.mutate();
          })}
        >
          <FormField label="Budget item" required error={formState.errors.budgetItemId}>
            <Select {...register('budgetItemId')}>
              <option value="">
                {itemsQuery.isLoading
                  ? 'Loading…'
                  : options.length === 0
                    ? 'No active budget items'
                    : 'Select…'}
              </option>
              {options.map((i) => (
                <option key={i.id} value={i.id}>
                  {budgetItemLabel(i)}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Paid date" required error={formState.errors.paidDate}>
              <Input type="date" {...register('paidDate')} />
            </FormField>
            <FormField label="Amount" required error={formState.errors.amount}>
              <Input type="number" step="0.01" min="0" inputMode="decimal" {...register('amount')} />
            </FormField>
          </div>
          <FormField label="Method" error={formState.errors.method} hint="Optional — e.g. cash, money order, payroll deduction.">
            <Input {...register('method')} />
          </FormField>
          <FormField label="Notes" error={formState.errors.notes}>
            <Textarea rows={3} {...register('notes')} />
          </FormField>
          <FormError message={topError} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={formState.isSubmitting || save.isPending}>
              {save.isPending ? 'Saving…' : creating ? 'Create' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete confirmations (case_management.delete — callers gate the buttons) ─

export function DeleteBudgetItemDialog({
  item,
  onClose,
}: {
  item: BudgetItemView | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/budget-items/${id}`),
    onSuccess: () => {
      invalidateBudgets(queryClient);
      setError(null);
      onClose();
    },
    onError: (err) => setError(applyApiError(err)),
  });

  return (
    <ConfirmDialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          onClose();
        }
      }}
      title="Delete budget item"
      description={
        item
          ? `Delete the ${budgetItemLabel(item)} budget item? Its recorded payments are kept.`
          : undefined
      }
      isPending={remove.isPending}
      error={error}
      onConfirm={() => item && remove.mutate(item.id)}
    />
  );
}

export function DeleteBudgetPaymentDialog({
  payment,
  onClose,
}: {
  payment: BudgetPaymentRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/budget-payments/${id}`),
    onSuccess: () => {
      invalidateBudgets(queryClient);
      setError(null);
      onClose();
    },
    onError: (err) => setError(applyApiError(err)),
  });

  return (
    <ConfirmDialog
      open={payment !== null}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          onClose();
        }
      }}
      title="Delete payment"
      description={
        payment
          ? `Delete the ${formatMoney(payment.amount)} payment recorded ${formatDate(payment.paidDate)} against ${budgetItemLabel(payment.budgetItem)}?`
          : undefined
      }
      isPending={remove.isPending}
      error={error}
      onConfirm={() => payment && remove.mutate(payment.id)}
    />
  );
}
