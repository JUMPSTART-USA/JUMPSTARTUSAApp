import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DataTable, type Column, type ListState } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DescriptionList, InfoItem } from '@/components/ui/description-list';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormError } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState, PageLoader } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FormField } from '@/components/FormField';
import { Textarea } from '@/components/ui/input';
import { api, ApiError, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError } from '@/lib/form';
import { formatDate, formatMoney } from '@/lib/utils';
import { ProgressBar, useDonorCrm } from '../shared';
import type { CampaignDetail, Donation } from '../types';
import { CampaignFormDialog } from './CampaignFormDialog';
import { BackLink } from '@/components/BackLink';

const donationColumns: Column<Donation>[] = [
  { key: 'donationDate', header: 'Date', sortKey: 'donationDate', render: (d) => formatDate(d.donationDate) },
  {
    key: 'donor',
    header: 'Donor',
    render: (d) =>
      d.donor ? (
        <Link to={`/donors/${d.donor.id}`} className="font-medium text-primary hover:underline">
          {d.donor.name}
        </Link>
      ) : (
        '—'
      ),
  },
  {
    key: 'amount',
    header: 'Amount',
    sortKey: 'amount',
    className: 'text-right',
    render: (d) => <span className="tabular-nums">{formatMoney(d.amount)}</span>,
  },
  { key: 'fund', header: 'Fund', render: (d) => d.fund ?? '—' },
  {
    key: 'event',
    header: 'Event',
    render: (d) =>
      d.event ? (
        <Link to={`/events/${d.event.id}`} className="text-primary hover:underline">
          {d.event.name}
        </Link>
      ) : (
        '—'
      ),
  },
];

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const { label: crmLabel, mirrored } = useDonorCrm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [localOpen, setLocalOpen] = useState(false);
  const [donationState, setDonationState] = useState<ListState>({
    page: 1,
    pageSize: 25,
    sortBy: 'donationDate',
    sortDir: 'desc',
  });

  const query = useQuery({
    queryKey: ['crm', 'campaigns', 'detail', id],
    queryFn: () => api.get<CampaignDetail>(`/campaigns/${id}`),
    enabled: Boolean(id),
  });

  const donationParams = qs({
    campaignId: id,
    page: donationState.page,
    pageSize: donationState.pageSize,
    sortBy: donationState.sortBy,
    sortDir: donationState.sortDir,
  });
  const donationsQuery = useQuery({
    queryKey: ['crm', 'donations', 'list', donationParams],
    queryFn: () => api.get<Paged<Donation>>(`/donations${donationParams}`),
    enabled: Boolean(id),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/campaigns/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'campaigns'] });
      navigate('/campaigns');
    },
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} />;
  if (!query.data) return null;

  const { campaign, raisedToDate, donationCount, progressPct, events } = query.data;

  return (
    <div className="space-y-4">
      <BackLink fallbackTo="/campaigns" fallbackLabel="Campaigns" />

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {campaign.name}
            <StatusBadge status={campaign.status} />
          </span>
        }
        actions={
          mirrored ? (
            can('campaigns.update') ? (
              <Button variant="outline" onClick={() => setLocalOpen(true)}>
                <Pencil className="h-4 w-4" /> Edit local fields
              </Button>
            ) : null
          ) : (
            <>
              {can('campaigns.update') ? (
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              ) : null}
              {can('campaigns.delete') ? (
                <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              ) : null}
            </>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {formatMoney(raisedToDate)}
              </span>
              <span className="text-sm text-muted-foreground">
                raised {campaign.goalAmount ? `of ${formatMoney(campaign.goalAmount)} goal` : '(no goal set)'}
              </span>
            </div>
            <ProgressBar pct={progressPct} />
            <p className="text-sm text-muted-foreground">
              {donationCount} gift{donationCount === 1 ? '' : 's'} linked to this campaign
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList className="gap-y-3">
              <InfoItem label="Start date">{formatDate(campaign.startDate)}</InfoItem>
              <InfoItem label="End date">{formatDate(campaign.endDate)}</InfoItem>
              <InfoItem label="Description">
                <span className="whitespace-pre-wrap">{campaign.description ?? '—'}</span>
              </InfoItem>
              <InfoItem label="Notes">
                <span className="whitespace-pre-wrap">{campaign.notes ?? '—'}</span>
              </InfoItem>
            </DescriptionList>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="donations">
        <TabsList>
          <TabsTrigger value="donations">Donations</TabsTrigger>
          <TabsTrigger value="events">Events ({events.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="donations">
          {donationsQuery.isError ? <ErrorState error={donationsQuery.error} /> : null}
          <DataTable
            columns={donationColumns}
            data={donationsQuery.data}
            isLoading={donationsQuery.isLoading}
            state={donationState}
            onStateChange={setDonationState}
            emptyMessage="No donations linked to this campaign"
          />
        </TabsContent>

        <TabsContent value="events">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events linked to this campaign.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow
                    key={event.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/events/${event.id}`)}
                  >
                    <TableCell className="font-medium">{event.name}</TableCell>
                    <TableCell>{formatDate(event.eventDate)}</TableCell>
                    <TableCell>{event.location ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(event.revenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(event.expenses)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      <CampaignFormDialog open={editOpen} onOpenChange={setEditOpen} campaign={campaign} />
      <EditCampaignLocalDialog
        open={localOpen}
        onOpenChange={setLocalOpen}
        campaignId={campaign.id}
        currentNotes={campaign.notes}
        crmLabel={crmLabel}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete campaign?"
        description={`“${campaign.name}” will be removed from lists. Linked donations and events keep their history.`}
        isPending={deleteMutation.isPending}
        error={deleteMutation.isError ? applyApiError(deleteMutation.error) : null}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}

/** With an active donor CRM, only local notes are editable here (§6.8). */
function EditCampaignLocalDialog({
  open,
  onOpenChange,
  campaignId,
  currentNotes,
  crmLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  currentNotes: string | null;
  crmLabel: string | null;
}) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(currentNotes ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.patch(`/campaigns/${campaignId}`, { notes: notes || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'campaigns'] });
      onOpenChange(false);
    },
    onError: (err) =>
      setFormError(err instanceof ApiError ? err.message : 'Save failed'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit local fields</DialogTitle>
          <DialogDescription>
            Only local notes are stored here — every other campaign field is managed in{' '}
            {crmLabel ?? 'the donor CRM'}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Local notes">
            <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
          <FormError message={formError} />
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
