import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ALUMNI_STATUSES,
  COMM_CHANNELS,
  US_STATES,
  VOLUNTEER_STATUSES,
  type CommunicationBatchInput,
} from '@jumpstart/shared';
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
import { Input, Select } from '@/components/ui/input';
import { FormError, Notice } from '@/components/ui/notice';
import { api } from '@/lib/api';
import { applyApiError, formResolver } from '@/lib/form';
import { humanize } from '@/lib/utils';
import { CHANNEL_LABELS, useActiveTemplates } from './shared';
import type { BatchCreateResult } from './types';

/**
 * Create a batch: audience is resolved server-side from the demographic
 * filters, suppression applied, one queued Communication per recipient. The
 * result notice reports matched/queued/suppressed before the user dispatches.
 *
 * The shared communicationBatchSchema keeps audienceFilter as an open record,
 * so the form validates a flat local shape and maps it to the API input.
 */
const batchFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  channel: z.enum(COMM_CHANNELS),
  templateId: z.string({ required_error: 'Choose a template' }).uuid('Choose a template'),
  alumniStatus: z.enum(ALUMNI_STATUSES).optional(),
  volunteerStatus: z.enum(VOLUNTEER_STATUSES).optional(),
  state: z.enum(US_STATES).optional(),
});

interface BatchFormValues {
  name: string;
  channel: string;
  templateId: string;
  alumniStatus: string;
  volunteerStatus: string;
  state: string;
}

export function NewBatchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState('');
  const [result, setResult] = useState<{
    matched: number;
    queued: number;
    suppressed: number;
  } | null>(null);

  const { register, handleSubmit, getValues, setValue, setError, watch, reset, formState } =
    useForm<BatchFormValues>({ resolver: formResolver(batchFormSchema) });

  const channel = watch('channel');
  const templates = useActiveTemplates(channel);

  useEffect(() => {
    if (open) {
      setTopError('');
      setResult(null);
      reset({
        name: '',
        channel: 'email',
        templateId: '',
        alumniStatus: '',
        volunteerStatus: '',
        state: '',
      });
    }
  }, [open, reset]);

  const create = useMutation({
    mutationFn: () => {
      const raw = getValues();
      const payload: CommunicationBatchInput = {
        name: raw.name.trim(),
        channel: raw.channel as CommunicationBatchInput['channel'],
        templateId: raw.templateId,
        audienceFilter: {
          ...(raw.alumniStatus ? { alumniStatus: raw.alumniStatus } : {}),
          ...(raw.volunteerStatus ? { volunteerStatus: raw.volunteerStatus } : {}),
          ...(raw.state ? { state: raw.state } : {}),
        },
      };
      return api.post<BatchCreateResult>('/communications/batches', payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['communications'] });
      setResult(
        res.counts ?? {
          matched: res.matched ?? 0,
          queued: res.queued ?? 0,
          suppressed: res.suppressed ?? 0,
        },
      );
    },
    onError: (err) => setTopError(applyApiError(err, setError) ?? ''),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>New batch</DialogTitle>
          <DialogDescription>
            Queue one message per person matching the audience filters. Do-not-contact and
            channel consent are applied automatically.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <Notice variant="success" title="Batch created">
              Matched {result.matched} {result.matched === 1 ? 'person' : 'people'} — queued{' '}
              {result.queued}, suppressed {result.suppressed}.
            </Notice>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={handleSubmit(() => {
              setTopError('');
              create.mutate();
            })}
          >
            <FormField label="Name" required error={formState.errors.name}>
              <Input {...register('name')} placeholder="e.g. March alumni newsletter" />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Channel" required error={formState.errors.channel}>
                <Select
                  {...register('channel', {
                    onChange: () => setValue('templateId', ''),
                  })}
                >
                  {COMM_CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {CHANNEL_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Template" required error={formState.errors.templateId}>
                <Select {...register('templateId')}>
                  <option value="">Select…</option>
                  {(templates.data?.items ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">Audience</p>
              <p className="text-xs text-muted-foreground">
                Leave a filter blank to skip it. Filters combine — everyone matching all of them
                is included.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Alumni status" error={formState.errors.alumniStatus}>
                <Select {...register('alumniStatus')}>
                  <option value="">Any</option>
                  {ALUMNI_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {humanize(s)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Volunteer status" error={formState.errors.volunteerStatus}>
                <Select {...register('volunteerStatus')}>
                  <option value="">Any</option>
                  {VOLUNTEER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {humanize(s)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="State" error={formState.errors.state}>
                <Select {...register('state')}>
                  <option value="">Any</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <FormError message={topError} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={formState.isSubmitting || create.isPending}>
                {create.isPending ? 'Saving…' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
