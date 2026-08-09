import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/filter-select';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced } from '@/lib/form';
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
  const [state, setState] = useState<ListState>(initialListState);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('');
  const [referralPartner, setReferralPartner] = useState('');
  const [chapter, setChapter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const debouncedSearch = useDebounced(search);

  useEffect(() => {
    setState((s) => ({ ...s, page: 1 }));
  }, [debouncedSearch]);

  const params = qs({
    page: state.page,
    pageSize: state.pageSize,
    sortBy: state.sortBy,
    sortDir: state.sortDir,
    search: debouncedSearch,
    active,
    isReferralPartner: referralPartner,
    // Chapter filter (§7.2) — still sent as the `state` query param.
    state: chapter,
  });
  const query = useQuery({
    queryKey: ['crm', 'vendors', 'list', params],
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
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, contact, or services…"
        />
        <FilterSelect
          aria-label="Status"
          value={active}
          onChange={(value) => {
            setActive(value);
            setState((s) => ({ ...s, page: 1 }));
          }}
          className="w-full sm:w-44"
        >
          <option value="">All vendors</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </FilterSelect>
        <FilterSelect
          aria-label="Partner type"
          value={referralPartner}
          onChange={(value) => {
            setReferralPartner(value);
            setState((s) => ({ ...s, page: 1 }));
          }}
          className="w-full sm:w-44"
        >
          <option value="">All partner types</option>
          <option value="true">Referral partners</option>
          <option value="false">Non-referral</option>
        </FilterSelect>
        {/* Chapter filter (§7.2) — hidden for scoped users (the API forces
            their chapter). */}
        <ChapterFilterSelect
          value={chapter}
          onChange={(value) => {
            setChapter(value);
            setState((s) => ({ ...s, page: 1 }));
          }}
        />
      </ListToolbar>

      {query.isError ? <ErrorState error={query.error} /> : null}
      <DataTable
        columns={columns}
        data={query.data}
        isLoading={query.isLoading}
        state={state}
        onStateChange={setState}
        onRowClick={
          canUpdate
            ? (row) => {
                setEditing(row);
                setDialogOpen(true);
              }
            : undefined
        }
        emptyMessage="No vendors found"
      />

      <VendorFormDialog open={dialogOpen} onOpenChange={setDialogOpen} vendor={editing} />
    </div>
  );
}
