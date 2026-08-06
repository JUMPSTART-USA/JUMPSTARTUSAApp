import { appealSchema, fundSchema } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormField } from '@/components/FormField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeaderRow } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { FormError } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState, Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError, formResolver, toDateInput } from '@/lib/form';
import { formatMoney } from '@/lib/utils';
import { ProgressBar, useCampaignOptions } from '../shared';
import type { AppealListItem, FundListItem } from '../types';
import { DonorsNav } from './DonorsNav';
import { BackLink } from '@/components/BackLink';

// ── Funds ───────────────────────────────────────────────────────────────────

interface FundFormValues {
  name: string;
  description?: string;
  isActive: boolean;
  sortOrder: number | string;
}

function FundFormDialog({
  open,
  onOpenChange,
  fund,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fund?: FundListItem;
}) {
  const queryClient = useQueryClient();
  const [topError, setTopError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FundFormValues>({ resolver: formResolver<FundFormValues>(fundSchema) });

  useEffect(() => {
    if (open) {
      reset({
        name: fund?.name ?? '',
        description: fund?.description ?? '',
        isActive: fund?.isActive ?? true,
        sortOrder: fund?.sortOrder ?? 0,
      });
      setTopError(null);
    }
  }, [open, fund, reset]);

  const mutation = useMutation({
    mutationFn: (values: FundFormValues) =>
      fund
        ? // Clearable description: blank means "clear" on edit, not "no change".
          api.patch(`/funds/${fund.id}`, { ...values, description: values.description ?? null })
        : api.post('/funds', values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm', 'funds'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{fund ? 'Edit fund' : 'New fund'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
          noValidate
        >
          <FormField label="Name" required error={errors.name}>
            <Input {...register('name')} autoFocus />
          </FormField>
          <FormField label="Description" error={errors.description}>
            <Textarea rows={2} {...register('description')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Sort order" error={errors.sortOrder}>
              <Input type="number" min="0" step="1" {...register('sortOrder')} />
            </FormField>
            <label className="flex items-center gap-2 pt-6 text-sm">
              <Checkbox {...register('isActive')} /> Active
            </label>
          </div>
          <FormError message={topError} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : fund ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FundsCard() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FundListItem | undefined>(undefined);
  const [deleting, setDeleting] = useState<FundListItem | null>(null);

  const query = useQuery({
    queryKey: ['crm', 'funds', 'list'],
    queryFn: () => api.get<Paged<FundListItem>>(`/funds${qs({ pageSize: 200 })}`),
  });

  const toggleMutation = useMutation({
    mutationFn: (fund: FundListItem) =>
      api.patch(`/funds/${fund.id}`, { isActive: !fund.isActive }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['crm', 'funds'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/funds/${deleting?.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm', 'funds'] });
      setDeleting(null);
    },
  });

  const canUpdate = can('donors.update');

  return (
    <Card>
      <CardHeaderRow
        title="Funds"
        description="Where gifts are designated — every donation can carry a fund."
      >
        {can('donors.create') ? (
          <Button onClick={() => { setEditing(undefined); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> New fund
          </Button>
        ) : null}
      </CardHeaderRow>
      <CardContent>
        {query.isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Spinner />
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} />
        ) : (query.data?.items.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No funds yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Raised to date</TableHead>
                <TableHead className="text-right">Gifts</TableHead>
                {canUpdate ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.items.map((fund) => (
                <TableRow key={fund.id}>
                  <TableCell>
                    <span className="font-medium">{fund.name}</span>
                    {fund.description ? (
                      <span className="block text-xs text-muted-foreground">
                        {fund.description}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {fund.isActive ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(fund.raisedToDate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fund.donationCount}</TableCell>
                  {canUpdate ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={toggleMutation.isPending}
                          onClick={() => toggleMutation.mutate(fund)}
                        >
                          {fund.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setEditing(fund); setFormOpen(true); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {can('donors.delete') ? (
                          <Button size="sm" variant="ghost" onClick={() => setDeleting(fund)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <FundFormDialog open={formOpen} onOpenChange={setFormOpen} fund={editing} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
        title="Delete fund?"
        description="Funds referenced by donations, pledges or recurring gifts cannot be deleted — deactivate them instead."
        isPending={deleteMutation.isPending}
        error={deleteMutation.isError ? applyApiError(deleteMutation.error) : null}
        onConfirm={() => deleteMutation.mutate()}
      />
    </Card>
  );
}

// ── Appeals ─────────────────────────────────────────────────────────────────

interface AppealFormValues {
  name: string;
  description?: string;
  campaignId?: string;
  goalAmount?: number | string;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
}

function AppealFormDialog({
  open,
  onOpenChange,
  appeal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appeal?: AppealListItem;
}) {
  const queryClient = useQueryClient();
  const campaignOptions = useCampaignOptions();
  const [topError, setTopError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<AppealFormValues>({ resolver: formResolver<AppealFormValues>(appealSchema) });

  useEffect(() => {
    if (open) {
      reset({
        name: appeal?.name ?? '',
        description: appeal?.description ?? '',
        campaignId: appeal?.campaignId ?? '',
        goalAmount: appeal?.goalAmount ?? '',
        startDate: toDateInput(appeal?.startDate),
        endDate: toDateInput(appeal?.endDate),
        isActive: appeal?.isActive ?? true,
      });
      setTopError(null);
    }
  }, [open, appeal, reset]);

  const mutation = useMutation({
    mutationFn: (values: AppealFormValues) =>
      appeal
        ? api.patch(`/appeals/${appeal.id}`, {
            ...values,
            // Clearable fields: blank means "clear" on edit, not "no change".
            campaignId: values.campaignId ?? null,
            description: values.description ?? null,
            goalAmount: values.goalAmount ?? null,
            startDate: values.startDate ?? null,
            endDate: values.endDate ?? null,
          })
        : api.post('/appeals', values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm', 'appeals'] });
      onOpenChange(false);
    },
    onError: (err) => setTopError(applyApiError(err, setError)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{appeal ? 'Edit appeal' : 'New appeal'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
          noValidate
        >
          <FormField label="Name" required error={errors.name}>
            <Input {...register('name')} autoFocus />
          </FormField>
          <FormField label="Description" error={errors.description}>
            <Textarea rows={2} {...register('description')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Campaign" error={errors.campaignId}>
              <Select {...register('campaignId')}>
                <option value="">None</option>
                {campaignOptions.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Goal amount" error={errors.goalAmount}>
              <Input type="number" step="0.01" min="0" {...register('goalAmount')} />
            </FormField>
            <FormField label="Start date" error={errors.startDate}>
              <Input type="date" {...register('startDate')} />
            </FormField>
            <FormField label="End date" error={errors.endDate}>
              <Input type="date" {...register('endDate')} />
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox {...register('isActive')} /> Active
          </label>
          <FormError message={topError} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : appeal ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AppealsCard() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AppealListItem | undefined>(undefined);
  const [deleting, setDeleting] = useState<AppealListItem | null>(null);

  const query = useQuery({
    queryKey: ['crm', 'appeals', 'list'],
    queryFn: () => api.get<Paged<AppealListItem>>(`/appeals${qs({ pageSize: 200 })}`),
    enabled: can('campaigns.read'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/appeals/${deleting?.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm', 'appeals'] });
      setDeleting(null);
    },
  });

  if (!can('campaigns.read')) return null;
  const canUpdate = can('campaigns.update');

  return (
    <Card>
      <CardHeaderRow
        title="Appeals"
        description="Specific asks — mailers, letters, giving days — optionally tied to a campaign."
      >
        {can('campaigns.create') ? (
          <Button onClick={() => { setEditing(undefined); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> New appeal
          </Button>
        ) : null}
      </CardHeaderRow>
      <CardContent>
        {query.isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Spinner />
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} />
        ) : (query.data?.items.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No appeals yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Goal</TableHead>
                <TableHead className="text-right">Raised</TableHead>
                <TableHead>Progress</TableHead>
                {canUpdate ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.items.map((appeal) => (
                <TableRow key={appeal.id}>
                  <TableCell className="font-medium">{appeal.name}</TableCell>
                  <TableCell>{appeal.campaign?.name ?? '—'}</TableCell>
                  <TableCell>
                    {appeal.isActive ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(appeal.goalAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(appeal.raisedToDate)}
                  </TableCell>
                  <TableCell>
                    <ProgressBar pct={appeal.progressPct} />
                  </TableCell>
                  {canUpdate ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setEditing(appeal); setFormOpen(true); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {can('campaigns.delete') ? (
                          <Button size="sm" variant="ghost" onClick={() => setDeleting(appeal)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <AppealFormDialog open={formOpen} onOpenChange={setFormOpen} appeal={editing} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
        title="Delete appeal?"
        description={`“${deleting?.name ?? ''}” is removed from lists — linked gifts keep their history.`}
        isPending={deleteMutation.isPending}
        error={deleteMutation.isError ? applyApiError(deleteMutation.error) : null}
        onConfirm={() => deleteMutation.mutate()}
      />
    </Card>
  );
}

export function DevelopmentSetupPage() {
  return (
    <div className="space-y-4">
      <BackLink stateOnly />
      <PageHeader
        title="Development setup"
        description="Funds and appeals used to designate and track gifts."
      />
      <DonorsNav />
      <FundsCard />
      <AppealsCard />
    </div>
  );
}
