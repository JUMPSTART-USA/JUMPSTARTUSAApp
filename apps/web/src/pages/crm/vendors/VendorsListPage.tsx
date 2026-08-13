import { CHAPTER_STATES } from '@jumpstart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, type Column } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/filter-select';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { P, useListParams } from '@/lib/list-params';
import type { Vendor } from '../types';
import { VendorFormDialog } from './VendorFormDialog';

const columns: Column<Vendor>[] = [
  { key: 'name', header: 'Name', sortKey: 'name', render: (v) => <span className="font-medium">{v.name}</span> },
  { key: 'contactPerson', header: 'Contact', render: (v) => v.contactPerson ?? '—' },
  { key: 'phone', header: 'Phone', render: (v) => v.phone ?? '—' },
  { key: 'email', header: 'Email', render: (v) => v.email ?? '—' },
  {
    // Postal address — the vendor's CHAPTER is the separate column below (§7.2).
    key: 'location',
    header: 'City / State',
    sortKey: 'city',
    render: (v) => [v.city, v.state].filter(Boolean).join(', ') || '—',
  },
  {
    key: 'chapterState',
    header: 'Chapter',
    sortKey: 'chapterState',
    render: (v) => <Badge variant="outline">{v.chapterState}</Badge>,
  },
  {
    key: 'servicesProvided',
    header: 'Services',
    className: 'max-w-[220px]',
    render: (v) => <span className="line-clamp-1">{v.servicesProvided ?? '—'}</span>,
  },
  {
    key: 'isReferralPartner',
    header: 'Referral partner',
    render: (v) => (v.isReferralPartner ? <Badge variant="info">Referral partner</Badge> : '—'),
  },
  {
    key: 'active',
    header: 'Active',
    sortKey: 'active',
    render: (v) =>
      v.active ? <Badge variant="success">Active</Badge> : <Badge variant="outline">Inactive</Badge>,
  },
];

export function VendorsListPage() {
  const { can } = useAuth();
  const { values, draft, set, listState, onListStateChange, clear, isFiltered } = useListParams(
    {
      search: P.text(),
      active: P.choice(['true', 'false'] as const, ''),
      referralPartner: P.choice(['true', 'false'] as const, ''),
      state: P.choice(CHAPTER_STATES, ''),
    },
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    search: values.search,
    active: values.active,
    isReferralPartner: values.referralPartner,
    // Chapter filter (§7.2) — still sent as the `state` query param.
    state: values.state,
  });
  const query = useQuery({
    queryKey: ['crm', 'vendors', 'list', params],
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
    queryFn: () => api.get<Paged<Vendor>>(`/vendors${params}`),
  });

  const canUpdate = can('vendors.update');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Vendors"
        description="Service providers and referral partners."
        actions={
          can('vendors.create') ? (
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> New vendor
            </Button>
          ) : null
        }
      />

      <ListToolbar>
        <SearchInput
          value={draft.search}
          onChange={(e) => set('search', e.target.value)}
          placeholder="Search name, contact, or services…"
        />
        <FilterSelect
          aria-label="Status"
          value={values.active}
          onChange={(value) => set('active', value as 'true' | 'false' | '')}
          className="w-full sm:w-44"
        >
          <option value="">All vendors</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </FilterSelect>
        <FilterSelect
          aria-label="Partner type"
          value={values.referralPartner}
          onChange={(value) => set('referralPartner', value as 'true' | 'false' | '')}
          className="w-full sm:w-44"
        >
          <option value="">All partner types</option>
          <option value="true">Referral partners</option>
          <option value="false">Non-referral</option>
        </FilterSelect>
        {/* Chapter filter (§7.2) — hidden for scoped users (the API forces
            their chapter). */}
        <ChapterFilterSelect
          value={values.state}
          onChange={(value) => set('state', value as (typeof CHAPTER_STATES)[number] | '')}
        />
      </ListToolbar>

      {query.isError ? <ErrorState error={query.error} onRetry={query.refetch} /> : null}
      <DataTable chapterScoped
        columns={columns}
        data={query.data}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        state={listState}
        onStateChange={onListStateChange}
        onRowClick={
          canUpdate
            ? (row) => {
                setEditing(row);
                setDialogOpen(true);
              }
            : undefined
        }
        isFiltered={isFiltered}
        onClearFilters={clear}
        emptyMessage="No vendors found"
      />

      <VendorFormDialog open={dialogOpen} onOpenChange={setDialogOpen} vendor={editing} />
    </div>
  );
}
