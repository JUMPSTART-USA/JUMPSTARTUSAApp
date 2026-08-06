import { volunteerHoursSchema } from '@jumpstart/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { VolunteerPicker, type PickerOption } from '@/components/pickers';
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
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { api } from '@/lib/api';
import { applyApiError, formResolver, todayInput } from '@/lib/form';
import { useOpportunitiesLookup } from './lookups';

interface HoursFormValues {
  volunteerProfileId: string;
  activityDate: string;
  hours: number | string;
  description?: string;
  opportunityId?: string;
}

const hoursResolver = formResolver<HoursFormValues>(volunteerHoursSchema);

/**
 * Staff hours entry (POST /volunteers/hours — source staff, approved by
 * default; "needs review" logs it pending instead). `volunteer` preset locks
 * the picker when opened from a volunteer's Hours tab.
 */
export function LogHoursDialog({
  open,
  onOpenChange,
  volunteer = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  volunteer?: PickerOption | null;
}) {
  const queryClient = useQueryClient();
  const opportunities = useOpportunitiesLookup();
  const [picked, setPicked] = useState<PickerOption | null>(null);
  const [needsReview, setNeedsReview] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const selected = volunteer ?? picked;

  const form = useForm<HoursFormValues>({
    resolver: hoursResolver,
    defaultValues: {
      volunteerProfileId: selected?.id ?? '',
      activityDate: todayInput(),
      hours: '',
      description: '',
      opportunityId: '',
    },
  });

  const pickVolunteer = (option: PickerOption | null) => {
    setPicked(option);
    form.setValue('volunteerProfileId', option?.id ?? '', { shouldValidate: false });
  };

  const close = (next: boolean) => {
    if (!next) {
      form.reset();
      setPicked(null);
      setNeedsReview(false);
      setTopError(null);
    }
    onOpenChange(next);
  };

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/volunteers/hours', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volunteers'] });
      close(false);
    },
    onError: (err) => setTopError(applyApiError(err, form.setError)),
  });

  const onSubmit = form.handleSubmit((data) => {
    setTopError(null);
    save.mutate({
      ...data,
      opportunityId: data.opportunityId ?? null,
      source: 'staff',
      status: needsReview ? 'pending' : 'approved',
    });
  });

  const { register, formState } = form;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Log hours</DialogTitle>
          <DialogDescription>
            Staff-entered hours are approved immediately unless marked for review.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormField label="Volunteer" required error={formState.errors.volunteerProfileId}>
            <VolunteerPicker
              value={selected}
              onChange={pickVolunteer}
              disabled={Boolean(volunteer) || save.isPending}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Date" required error={formState.errors.activityDate}>
              <Input type="date" {...register('activityDate')} />
            </FormField>
            <FormField label="Hours" required error={formState.errors.hours}>
              <Input type="number" min={0.25} max={24} step={0.25} {...register('hours')} />
            </FormField>
          </div>
          <FormField label="Opportunity" error={formState.errors.opportunityId}>
            <Select {...register('opportunityId')} disabled={!opportunities.allowed}>
              <option value="">—</option>
              {opportunities.items.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Description" error={formState.errors.description}>
            <Textarea rows={2} {...register('description')} placeholder="What was the service?" />
          </FormField>
          <Label className="flex items-center gap-2 text-sm font-normal">
            <Checkbox
              checked={needsReview}
              onChange={(e) => setNeedsReview(e.target.checked)}
            />
            Needs review — log as pending approval
          </Label>

          <FormError message={topError} />

          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Log hours'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
