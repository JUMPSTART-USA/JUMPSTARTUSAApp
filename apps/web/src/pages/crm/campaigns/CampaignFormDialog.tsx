import { zodResolver } from '@hookform/resolvers/zod';
import { campaignSchema } from '@jumpstart/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { api } from '@/lib/api';
import { applyApiError } from '@/lib/form';
import { humanize } from '@/lib/utils';
import type { Campaign, CampaignStatus } from '../types';

const CAMPAIGN_STATUSES: CampaignStatus[] = ['planned', 'active', 'completed', 'canceled'];

interface CampaignFormValues {
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  goalAmount?: number | string;
  status: CampaignStatus;
  notes?: string;
}

export function CampaignFormDialog({
  open,
  onOpenChange,
  campaign,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign?: Campaign | null;
}) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignSchema) as unknown as Resolver<CampaignFormValues>,
  });

  useEffect(() => {
    if (open) {
      form.reset(
        campaign
          ? {
              name: campaign.name,
              description: campaign.description ?? '',
              startDate: campaign.startDate?.slice(0, 10) ?? '',
              endDate: campaign.endDate?.slice(0, 10) ?? '',
              goalAmount: campaign.goalAmount ?? '',
              status: campaign.status,
              notes: campaign.notes ?? '',
            }
          : { name: '', status: 'active' },
      );
      setFormError(null);
    }
  }, [open, campaign]);

  const mutation = useMutation({
    mutationFn: (values: CampaignFormValues) =>
      campaign
        ? api.patch<Campaign>(`/campaigns/${campaign.id}`, values)
        : api.post<Campaign>('/campaigns', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'campaigns'] });
      onOpenChange(false);
    },
    onError: (err) => setFormError(applyApiError(err, form.setError)),
  });

  const optional = { setValueAs: (v: unknown) => (v === '' ? undefined : v) };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{campaign ? 'Edit campaign' : 'New campaign'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
        >
          <FormField label="Name" required error={form.formState.errors.name}>
            <Input {...form.register('name')} />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Status" required error={form.formState.errors.status}>
              <Select {...form.register('status')}>
                {CAMPAIGN_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Goal amount" error={form.formState.errors.goalAmount}>
              <Input type="number" step="0.01" min="0" {...form.register('goalAmount', optional)} />
            </FormField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Start date" error={form.formState.errors.startDate}>
              <Input type="date" {...form.register('startDate', optional)} />
            </FormField>
            <FormField label="End date" error={form.formState.errors.endDate}>
              <Input type="date" {...form.register('endDate', optional)} />
            </FormField>
          </div>
          <FormField label="Description" error={form.formState.errors.description}>
            <Textarea rows={3} {...form.register('description', optional)} />
          </FormField>
          <FormField label="Notes" error={form.formState.errors.notes}>
            <Textarea rows={2} {...form.register('notes', optional)} />
          </FormField>
          <FormError message={formError} />
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : campaign ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
