import { INTAKE_STATUSES } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { DescriptionList, InfoItem } from '@/components/ui/description-list';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced } from '@/lib/form';
import { formatDate, humanize } from '@/lib/utils';
import { DuplicateCandidatePicker, ReviewControls, SubmittedAge } from './review';
import { apiErrorMessage, type ReferralItem, type ReviewPayload } from './types';

function ReferralDialog({ item, onClose }: { item: ReferralItem; onClose: () => void }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [existingPersonId, setExistingPersonId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: ReviewPayload) =>
      api.post(`/intake/referrals/${item.id}/review`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intake'] });
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            Referral — {item.subjectFirstName} {item.subjectLastName}
          </DialogTitle>
          <DialogDescription>
            Submitted {formatDate(item.submittedAt)} · contains third-party PII, handle per
            §6.11
          </DialogDescription>
        </DialogHeader>

        <DescriptionList>
          <InfoItem label="Referred by">
            {humanize(item.referrerType)}
            {item.referrerName ? ` — ${item.referrerName}` : ''}
          </InfoItem>
          <InfoItem label="Referrer contact">
            {[item.referrerPhone, item.referrerEmail].filter(Boolean).join(' · ') || '—'}
          </InfoItem>
          <InfoItem label="Subject phone">{item.subjectPhone ?? '—'}</InfoItem>
          <InfoItem label="Facility">{item.facilityName ?? '—'}</InfoItem>
          <InfoItem label="State">{item.state ?? '—'}</InfoItem>
          <InfoItem label="Expected release">{formatDate(item.expectedReleaseDate)}</InfoItem>
          <InfoItem label="Needs" className="sm:col-span-2">
            <span className="whitespace-pre-wrap">{item.needs}</span>
          </InfoItem>
        </DescriptionList>

        <DuplicateCandidatePicker
          candidates={item.duplicateCandidates}
          value={existingPersonId}
          onChange={setExistingPersonId}
        />

        <ReviewControls
          status={item.status}
          reviewedAt={item.reviewedAt}
          reviewNotes={item.reviewNotes}
          canUpdate={can('intake_queues.update')}
          pending={mutation.isPending}
          error={error}
          approveHint="Approving creates (or links) the person, opens a participant profile at intake status, and instantiates the onboarding checklist."
          onAction={(payload) => {
            setError(null);
            mutation.mutate({
              ...payload,
              ...(payload.action === 'approve' && existingPersonId
                ? { existingPersonId }
                : {}),
            });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function ReferralsTab() {
  const [state, setState] = useState<ListState>({ ...initialListState, sortBy: 'submittedAt' });
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const debounced = useDebounced(search);

  const query = useQuery({
    queryKey: ['intake', 'referrals', state, status, debounced],
    queryFn: () =>
      api.get<Paged<ReferralItem>>(
        `/intake/referrals${qs({
          page: state.page,
          pageSize: state.pageSize,
          sortBy: state.sortBy,
          sortDir: state.sortDir,
          status: status || undefined,
          search: debounced,
        })}`,
      ),
  });

  const selected = query.data?.items.find((i) => i.id === selectedId) ?? null;

  const columns: Column<ReferralItem>[] = [
    {
      key: 'subject',
      header: 'Subject',
      render: (r) => (
        <span className="font-medium">
          {r.subjectFirstName} {r.subjectLastName}
        </span>
      ),
    },
    {
      key: 'referrer',
      header: 'Referrer',
      render: (r) => (
        <span>
          {humanize(r.referrerType)}
          {r.referrerName ? (
            <span className="text-muted-foreground"> · {r.referrerName}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'facility',
      header: 'Facility / State',
      render: (r) => [r.facilityName, r.state].filter(Boolean).join(' · ') || '—',
    },
    {
      key: 'release',
      header: 'Expected release',
      render: (r) => formatDate(r.expectedReleaseDate),
    },
    {
      key: 'submittedAt',
      header: 'Submitted',
      sortKey: 'submittedAt',
      render: (r) => <SubmittedAge submittedAt={r.submittedAt} status={r.status} />,
    },
    {
      key: 'duplicates',
      header: 'Duplicates',
      render: (r) =>
        r.duplicateCandidates.length > 0 ? (
          <Badge variant="warning">{r.duplicateCandidates.length}</Badge>
        ) : (
          '—'
        ),
    },
    { key: 'status', header: 'Status', sortKey: 'status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="space-y-3">
      <ListToolbar>
        <SearchInput
          placeholder="Search subject or referrer…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setState((s) => ({ ...s, page: 1 }));
          }}
        />
        <Select
          className="w-full sm:w-44"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setState((s) => ({ ...s, page: 1 }));
          }}
        >
          <option value="">All statuses</option>
          {INTAKE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
      </ListToolbar>

      {query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data}
          isLoading={query.isLoading}
          state={state}
          onStateChange={setState}
          onRowClick={(row) => setSelectedId(row.id)}
          emptyMessage="No referrals in this view"
        />
      )}

      {selected ? <ReferralDialog item={selected} onClose={() => setSelectedId(null)} /> : null}
    </div>
  );
}
