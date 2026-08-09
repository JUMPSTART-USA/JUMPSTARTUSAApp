import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, SearchInput } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced } from '@/lib/form';
import { SeverityBadge, vehicleLabel } from './shared';
import { VehicleFormDialog } from './VehicleFormDialog';
import type { AlertSeverity, VehicleAlert, VehicleListItem } from './types';
import { BackLink } from '@/components/BackLink';

const SEVERITY_ORDER: AlertSeverity[] = ['overdue', 'due_soon', 'upcoming'];

export function VehiclesListPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [listState, setListState] = useState<ListState>(initialListState);
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('');
  const [active, setActive] = useState('true');
  const [stateFilter, setStateFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounced(search);
  const debouncedLocation = useDebounced(location);

  const query = useQuery({
    queryKey: [
      'fleet',
      'vehicles',
      'list',
      listState,
      debouncedSearch,
      debouncedLocation,
      active,
      stateFilter,
    ],
    queryFn: () =>
      api.get<Paged<VehicleListItem>>(
        `/vehicles${qs({
          page: listState.page,
          pageSize: listState.pageSize,
          sortBy: listState.sortBy,
          sortDir: listState.sortDir,
          search: debouncedSearch,
          assignedLocation: debouncedLocation,
          active,
          state: stateFilter,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  // One alerts fetch feeds the per-row indicator column — same chapter filter
  // as the table so the counts match what is listed (§7.2).
  const alertsQuery = useQuery({
    queryKey: ['fleet', 'alerts', stateFilter],
    queryFn: () =>
      api.get<{ items: VehicleAlert[]; total: number }>(
        `/vehicles/alerts${qs({ state: stateFilter })}`,
      ),
  });

  const alertsByVehicle = useMemo(() => {
    const map = new Map<string, { worst: AlertSeverity; count: number }>();
    for (const alert of alertsQuery.data?.items ?? []) {
      const entry = map.get(alert.vehicleId);
      if (!entry) {
        map.set(alert.vehicleId, { worst: alert.severity, count: 1 });
      } else {
        entry.count += 1;
        if (SEVERITY_ORDER.indexOf(alert.severity) < SEVERITY_ORDER.indexOf(entry.worst)) {
          entry.worst = alert.severity;
        }
      }
    }
    return map;
  }, [alertsQuery.data]);

  const columns = useMemo<Column<VehicleListItem>[]>(
    () => [
      {
        key: 'vehicle',
        header: 'Vehicle',
        sortKey: 'make',
        render: (row) => (
          <span className="font-medium">
            {vehicleLabel(row)}
            {row.color ? <span className="font-normal text-muted-foreground"> · {row.color}</span> : null}
          </span>
        ),
      },
      { key: 'licensePlate', header: 'Plate', render: (row) => row.licensePlate ?? '—' },
      {
        key: 'mileage',
        header: 'Mileage',
        sortKey: 'mileage',
        className: 'text-right',
        render: (row) => (row.mileage != null ? row.mileage.toLocaleString('en-US') : '—'),
      },
      {
        key: 'assignedLocation',
        header: 'Location',
        sortKey: 'assignedLocation',
        render: (row) => row.assignedLocation ?? '—',
      },
      // The vehicle's CHAPTER (§7.2), not a postal address.
      {
        key: 'chapterState',
        header: 'Chapter',
        sortKey: 'chapterState',
        render: (row) => row.chapterState,
      },
      {
        key: 'active',
        header: 'Status',
        render: (row) =>
          row.active ? <Badge variant="success">Active</Badge> : <Badge variant="outline">Inactive</Badge>,
      },
      {
        key: 'alerts',
        header: 'Alerts',
        render: (row) => {
          const entry = alertsByVehicle.get(row.id);
          if (!entry) return <span className="text-muted-foreground">—</span>;
          return (
            <span className="inline-flex items-center gap-1.5">
              <SeverityBadge severity={entry.worst} />
              {entry.count > 1 ? (
                <span className="text-xs text-muted-foreground">+{entry.count - 1}</span>
              ) : null}
            </span>
          );
        },
      },
      {
        key: 'maintenance',
        header: 'Services',
        className: 'text-right',
        render: (row) => row._count.maintenanceRecords,
      },
    ],
    [alertsByVehicle],
  );

  const resetPage = () => setListState((s) => ({ ...s, page: 1 }));

  return (
    <div className="space-y-4">
      <BackLink stateOnly />
      <PageHeader
        title="Vehicles"
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/vehicles/alerts')}>
              <AlertTriangle className="h-4 w-4" /> Alerts
              {alertsQuery.data?.total ? (
                <Badge variant="destructive" className="ml-1">
                  {alertsQuery.data.total}
                </Badge>
              ) : null}
            </Button>
            {can('vehicles.create') ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> New vehicle
              </Button>
            ) : null}
          </>
        }
      />

      <ListToolbar>
        <SearchInput
          placeholder="Search make, model, plate…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            resetPage();
          }}
        />
        <Input
          className="w-full sm:w-44"
          placeholder="Location"
          value={location}
          onChange={(e) => {
            setLocation(e.target.value);
            resetPage();
          }}
        />
        <Select
          aria-label="Status"
          className="w-full sm:w-44"
          value={active}
          onChange={(e) => {
            setActive(e.target.value);
            resetPage();
          }}
        >
          <option value="">All vehicles</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </Select>
        {/* Chapter filter (§7.2) — sent as the `state` query param; hidden for
            scoped users (the API forces their chapter). */}
        <ChapterFilterSelect
          value={stateFilter}
          onChange={(value) => {
            setStateFilter(value);
            resetPage();
          }}
        />
      </ListToolbar>

      {query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data}
          isLoading={query.isLoading}
          state={listState}
          onStateChange={setListState}
          onRowClick={(row) => navigate(row.id)}
          emptyMessage="No vehicles found"
        />
      )}

      <VehicleFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
