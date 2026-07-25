import { INTAKE_STATUSES } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { Badge, StatusBadge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, humanize } from '@/lib/utils';
import { DuplicateCandidatePicker, ReviewControls, Row, SubmittedAge } from './review';
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Volunteer application — {item.firstName} {item.lastName}
          </DialogTitle>
          <DialogDescription>
            Submitted {formatDate(item.submittedAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y">
          <Row label="Email">{item.email ?? '—'}</Row>
          <Row label="Phone">{item.phone ?? '—'}</Row>
          <Row label="Location">
            {[item.city, item.state].filter(Boolean).join(', ') || '—'}
          </Row>
          <Row label="Interest areas">
            {item.interestAreas.length > 0
              ? item.interestAreas.map((a) => (
                  <Badge key={a} variant="secondary" className="mr-1">
                    {a}
                  </Badge>
                ))
              : '—'}
          </Row>
          <Row label="Availability">{item.availability ?? '—'}</Row>
          <Row label="Church affiliation">{item.churchAffiliation ?? '—'}</Row>
          <Row label="Message">
            <span className="whitespace-pre-wrap">{item.message ?? '—'}</span>
          </Row>
          <Row label="Consent">{item.consentAt ? formatDate(item.consentAt) : '—'}</Row>
        </div>

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
  const [debounced, setDebounced] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setState((s) => ({ ...s, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

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
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-64"
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className="w-40"
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
      </div>

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
