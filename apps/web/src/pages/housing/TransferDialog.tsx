import { housingTransferSchema } from '@jumpstart/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { FormError, Notice } from '@/components/ui/notice';
import { api } from '@/lib/api';
import { applyApiError, formResolver, todayInput } from '@/lib/form';
import type { HousingEnrollment, TransferResult } from './types';
import { homeOptionLabel, useHomeOptions } from './useHomeOptions';

interface TransferFormValues {
  fromEnrollmentId: string;
  toHomeId: string;
  transferDate: string;
  reason: string;
  notes?: string;
}

export function TransferDialog({
  open,
  onOpenChange,
  enrollment,
  residentName,
  currentHomeName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Must be an ACTIVE enrollment — the API rejects transfers of closed records. */
  enrollment: HousingEnrollment | null;
  residentName: string;
  currentHomeName: string;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[] | null>(null);

  const homeOptions = useHomeOptions(open);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<TransferFormValues>({
    resolver: formResolver<TransferFormValues>(housingTransferSchema),
  });

  useEffect(() => {
    if (open && enrollment) {
      reset({
        fromEnrollmentId: enrollment.id,
        toHomeId: '',
        transferDate: todayInput(),
        reason: '',
        notes: '',
      });
      setTopError(null);
      setWarnings(null);
    }
  }, [open, enrollment, reset]);

  const mutation = useMutation({
    mutationFn: (values: TransferFormValues) =>
      api.post<TransferResult>(`/housing-enrollments/${enrollment!.id}/transfer`, values),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['housing'] });
      if (res.warnings?.length) setWarnings(res.warnings);
      else onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  if (!enrollment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Transfer resident</DialogTitle>
          <DialogDescription>
            {residentName} — currently at {currentHomeName}
          </DialogDescription>
        </DialogHeader>
        {warnings ? (
          <div className="space-y-4">
            <p className="text-sm">Transfer recorded.</p>
            <Notice variant="warning">
              <ul>
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Notice>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
            {/* §6.4: one action, two records — history preserved. */}
            <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
              A transfer closes this enrollment (status “Transferred”, move-out on the transfer
              date) and opens a new active enrollment at the destination — one step, full history
              preserved.
            </p>
            <FormError message={topError} />
            <input type="hidden" {...register('fromEnrollmentId')} />
            <FormField label="Destination home" required error={errors.toHomeId}>
              <Select {...register('toHomeId')}>
                <option value="">Select a home…</option>
                {homeOptions.data
                  ?.filter((h) => h.id !== enrollment.homeId)
                  .map((h) => (
                    <option key={h.id} value={h.id}>
                      {homeOptionLabel(h)}
                    </option>
                  ))}
              </Select>
            </FormField>
            <FormField label="Transfer date" required error={errors.transferDate}>
              <Input type="date" {...register('transferDate')} />
            </FormField>
            <FormField label="Reason" required error={errors.reason}>
              <Input {...register('reason')} placeholder="Why is the resident moving?" />
            </FormField>
            <FormField
              label="Notes"
              error={errors.notes}
              hint="Carried onto the new enrollment at the destination"
            >
              <Textarea rows={2} {...register('notes')} />
            </FormField>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Transferring…' : 'Transfer'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
