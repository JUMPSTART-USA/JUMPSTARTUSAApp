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
import {
  apiErrorMessage,
  type ReviewPayload,
  type VolunteerApplicationItem,
} from './types';

function ApplicationDialog({
  item,
  onClose,
}: {
  item: VolunteerApplicationItem;
  onClose: () => void;
}) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [existingPersonId, setExistingPersonId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: ReviewPayload) =>
      api.post(`/intake/volunteer-applications/${item.id}/review`, payload),
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
            Volunteer application — {item.firstName} {item.lastName}
          </DialogTitle>
          <DialogDescription>
            Submitted {formatDate(item.submittedAt)}
          </DialogDescription>
        </DialogHeader>

        <DescriptionList>
          <InfoItem label="Email">{item.email ?? '—'}</InfoItem>
          <InfoItem label="Phone">{item.phone ?? '—'}</InfoItem>
          <InfoItem label="Location">
            {[item.city, item.state].filter(Boolean).join(', ') || '—'}
          </InfoItem>
          <InfoItem label="Interest areas">
            {item.interestAreas.length > 0
              ? item.interestAreas.map((a) => (
                  <Badge key={a} variant="secondary" className="mr-1">
                    {a}
                  </Badge>
                ))
              : '—'}
          </InfoItem>
          <InfoItem label="Availability">{item.availability ?? '—'}</InfoItem>
          <InfoItem label="Church affiliation">{item.churchAffiliation ?? '—'}</InfoItem>
          <InfoItem label="Message" className="sm:col-span-2">
            <span className="whitespace-pre-wrap">{item.message ?? '—'}</span>
          </InfoItem>
          <InfoItem label="Consent">{item.consentAt ? formatDate(item.consentAt) : '—'}</InfoItem>
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
          approveHint="Approving creates (or links) the person and opens a volunteer profile in the screening pipeline."
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

export function VolunteerApplicationsTab() {
  const [state, setState] = useState<ListState>({ ...initialListState, sortBy: 'submittedAt' });
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const debounced = useDebounced(search);

  const query = useQuery({
    queryKey: ['intake', 'volunteer-applications', state, status, debounced],
    queryFn: () =>
      api.get<Paged<VolunteerApplicationItem>>(
        `/intake/volunteer-applications${qs({
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

  const columns: Column<VolunteerApplicationItem>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (a) => (
        <span className="font-medium">
          {a.firstName} {a.lastName}
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (a) => a.email ?? a.phone ?? '—',
    },
    {
      key: 'location',
      header: 'Location',
      render: (a) => [a.city, a.state].filter(Boolean).join(', ') || '—',
    },
    {
      key: 'interests',
      header: 'Interests',
      render: (a) =>
        a.interestAreas.length > 0 ? a.interestAreas.slice(0, 3).join(', ') : '—',
    },
    {
      key: 'submittedAt',
      header: 'Submitted',
      sortKey: 'submittedAt',
      render: (a) => <SubmittedAge submittedAt={a.submittedAt} status={a.status} />,
    },
    {
      key: 'duplicates',
      header: 'Duplicates',
      render: (a) =>
        a.duplicateCandidates.length > 0 ? (
          <Badge variant="warning">{a.duplicateCandidates.length}</Badge>
        ) : (
          '—'
        ),
    },
    { key: 'status', header: 'Status', sortKey: 'status', render: (a) => <StatusBadge status={a.status} /> },
  ];

  return (
    <div className="space-y-3">
      <ListToolbar>
        <SearchInput
          placeholder="Search name or email…"
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
          emptyMessage="No volunteer applications in this view"
        />
      )}

      {selected ? (
        <ApplicationDialog item={selected} onClose={() => setSelectedId(null)} />
      ) : null}
    </div>
  );
}
