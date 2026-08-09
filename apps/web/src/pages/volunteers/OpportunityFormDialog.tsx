import {
  OPPORTUNITY_STATUSES,
  OPPORTUNITY_STATUS_LABELS,
  volunteerOpportunitySchema,
  type ChapterState,
  type OpportunityStatus,
} from '@jumpstart/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { ChapterSelect } from '@/components/ChapterSelect';
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
import { FormError } from '@/components/ui/notice';
import { api } from '@/lib/api';
import { applyApiError, formResolver } from '@/lib/form';
import { useEventsLookup, useInstitutionsLookup, useOutsideProgramsLookup } from './lookups';
import type { OpportunityFields } from './types';

interface OpportunityFormValues {
  name: string;
  description?: string;
  // Chapter (§7.2): required pick for all-chapters users; stamped server-side
  // for chapter-scoped users.
  state?: ChapterState;
  institutionId?: string;
  outsideProgramId?: string;
  eventId?: string;
  location?: string;
  status: OpportunityStatus;
  notes?: string;
}

const resolver = formResolver<OpportunityFormValues>(volunteerOpportunitySchema);

/** Create + edit dialog for volunteer opportunities. */
export function OpportunityFormDialog({
  opportunity,
  open,
  onOpenChange,
}: {
  opportunity: OpportunityFields | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [topError, setTopError] = useState<string | null>(null);
  const institutions = useInstitutionsLookup();
  const programs = useOutsideProgramsLookup();
  const events = useEventsLookup();

  const form = useForm<OpportunityFormValues>({
    resolver,
    values: {
      name: opportunity?.name ?? '',
      description: opportunity?.description ?? '',
      state: (opportunity?.state ?? undefined) as ChapterState | undefined,
      institutionId: opportunity?.institutionId ?? '',
      outsideProgramId: opportunity?.outsideProgramId ?? '',
      eventId: opportunity?.eventId ?? '',
      location: opportunity?.location ?? '',
      status: opportunity?.status ?? 'open',
      notes: opportunity?.notes ?? '',
    },
  });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      opportunity
        ? api.patch<{ id: string }>(`/volunteers/opportunities/${opportunity.id}`, payload)
        : api.post<{ id: string }>('/volunteers/opportunities', payload),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['volunteers'] });
      setTopError(null);
      onOpenChange(false);
      if (!opportunity) navigate(`/volunteers/opportunities/${saved.id}`);
    },
    onError: (err) => setTopError(applyApiError(err, form.setError)),
  });

  const onSubmit = form.handleSubmit((data) => {
    setTopError(null);
    // Blank inputs mean "no value" — send explicit nulls so edits can clear.
    save.mutate({
      ...data,
      description: data.description ?? null,
      state: data.state ?? null,
      institutionId: data.institutionId ?? null,
      outsideProgramId: data.outsideProgramId ?? null,
      eventId: data.eventId ?? null,
      location: data.location ?? null,
      notes: data.notes ?? null,
    });
  });

  const { register, formState } = form;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{opportunity ? 'Edit opportunity' : 'New opportunity'}</DialogTitle>
          <DialogDescription>
            Volunteer opportunities group shifts and hours for a program, facility or event.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Name" required error={formState.errors.name} className="sm:col-span-2">
              <Input {...register('name')} placeholder="e.g. Community Reentry Day" />
            </FormField>
            <FormField label="Status" error={formState.errors.status}>
              <Select {...register('status')}>
                {OPPORTUNITY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {OPPORTUNITY_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </FormField>
            <ChapterSelect
              error={formState.errors.state}
              hint="Scopes the opportunity to a chapter"
              {...register('state', { setValueAs: (v) => (v === '' ? undefined : v) })}
            />
            <FormField label="Location" error={formState.errors.location} className="sm:col-span-2">
              <Input {...register('location')} placeholder="Where volunteers report" />
            </FormField>
            <FormField label="Institution" error={formState.errors.institutionId}>
              <Select {...register('institutionId')} disabled={!institutions.allowed}>
                <option value="">—</option>
                {institutions.items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                    {i.state ? ` (${i.state})` : ''}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Outside program" error={formState.errors.outsideProgramId}>
              <Select {...register('outsideProgramId')} disabled={!programs.allowed}>
                <option value="">—</option>
                {programs.items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Event" error={formState.errors.eventId}>
              <Select {...register('eventId')} disabled={!events.allowed}>
                <option value="">—</option>
                {events.items.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              label="Description"
              error={formState.errors.description}
              className="sm:col-span-2"
            >
              <Textarea rows={3} {...register('description')} />
            </FormField>
            <FormField label="Notes" error={formState.errors.notes} className="sm:col-span-2">
              <Textarea rows={2} {...register('notes')} />
            </FormField>
          </div>

          <FormError message={topError} />

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : opportunity ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
