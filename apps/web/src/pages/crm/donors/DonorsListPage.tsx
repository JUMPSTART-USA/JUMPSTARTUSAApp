import { DONOR_TYPES } from '@jumpstart/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { Input, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { formatDate, formatMoney, humanize } from '@/lib/utils';
import { useDebouncedValue } from '../shared';
import type { DonorCrmStatus, DonorListItem } from '../types';
import { DonorsNav } from './DonorsNav';
import { SyncStatusChip } from './SyncStatusChip';

const DONOR_STATUSES = ['active', 'lapsed', 'inactive'] as const;

const columns: Column<DonorListItem>[] = [
  { key: 'name', header: 'Name', sortKey: 'name', render: (d) => <span className="font-medium">{d.name}</span> },
  { key: 'donorType', header: 'Type', sortKey: 'donorType', render: (d) => humanize(d.donorType) },
  { key: 'status', header: 'Status', sortKey: 'status', render: (d) => <StatusBadge status={d.status} /> },
  { key: 'email', header: 'Email', render: (d) => d.email ?? '—' },
  {
    key: 'location',
    header: 'City / State',
    sortKey: 'city',
    render: (d) => [d.city, d.state].filter(Boolean).join(', ') || '—',
  },
  {
    key: 'lifetimeGiving',
    header: 'Lifetime giving',
    className: 'text-right',
    render: (d) => <span className="tabular-nums">{formatMoney(d.lifetimeGiving)}</span>,
  },
  { key: 'lastGiftDate', header: 'Last gift', render: (d) => formatDate(d.lastGiftDate) },
];

export function DonorsListPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<ListState>(initialListState);
  const [search, setSearch] = useState('');
  const [donorType, setDonorType] = useState('');
  const [status, setStatus] = useState('');
  const debouncedSearch = useDebouncedValue(search);

  const crmStatus = useQuery({
    queryKey: ['crm', 'sync', 'status'],
    queryFn: () => api.get<DonorCrmStatus>('/sync/status'),
  });
  const crmName = crmStatus.data?.provider === 'none' ? null : crmStatus.data?.providerLabel;

  useEffect(() => {
    setState((s) => ({ ...s, page: 1 }));
  }, [debouncedSearch]);

  const params = qs({
    page: state.page,
    pageSize: state.pageSize,
    sortBy: state.sortBy,
    sortDir: state.sortDir,
    search: debouncedSearch,
    donorType,
    status,
  });
  const query = useQuery({
    queryKey: ['crm', 'donors', 'list', params],
    queryFn: () => api.get<Paged<DonorListItem>>(`/donors${params}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Donors</h1>
          <p className="text-sm text-muted-foreground">
            {crmName
              ? `Read-only mirror of ${crmName} — edits to giving data happen there.`
              : 'Donor records — no external donor CRM is configured.'}
          </p>
        </div>
        <SyncStatusChip />
      </div>

      <DonorsNav active="donors" />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email…"
          className="max-w-xs"
        />
        <Select
          value={donorType}
          onChange={(e) => {
            setDonorType(e.target.value);
            setState((s) => ({ ...s, page: 1 }));
          }}
          className="w-44"
        >
          <option value="">All types</option>
          {DONOR_TYPES.map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setState((s) => ({ ...s, page: 1 }));
          }}
          className="w-40"
        >
          <option value="">All statuses</option>
          {DONOR_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
      </div>

      {query.isError ? <ErrorState error={query.error} /> : null}
      <DataTable
        columns={columns}
        data={query.data}
        isLoading={query.isLoading}
        state={state}
        onStateChange={setState}
        onRowClick={(row) => navigate(`/donors/${row.id}`)}
        emptyMessage="No donors found"
      />
    </div>
  );
}
