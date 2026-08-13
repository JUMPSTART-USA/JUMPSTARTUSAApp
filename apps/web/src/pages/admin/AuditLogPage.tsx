import { AUDIT_ACTIONS } from '@jumpstart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DataTable, type Column } from '@/components/DataTable';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FilterSelect, unresolvedOptionLabel } from '@/components/ui/filter-select';
import { Input, Label } from '@/components/ui/input';
import { SectionHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, NoAccess } from '@/components/ui/spinner';
import { ListToolbar } from '@/components/ui/toolbar';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { P, useListParams } from '@/lib/list-params';
import { humanize } from '@/lib/utils';
import { formatDateTime, JsonBlock, useActiveUserOptions } from './shared';
import type { AuditLogEntry } from './types';

/**
 * Not a status map and deliberately not folded into the kit's: these are verbs
 * that already happened, coloured by how closely the action deserves reading
 * rather than by whether a record is healthy. `export`, `permission_change` and
 * `read_confidential` all succeeded — they are warnings because an auditor
 * should stop on them, which is not a meaning STATUS_VARIANTS can carry.
 */
const ACTION_VARIANTS: Record<string, BadgeProps['variant']> = {
  create: 'success',
  update: 'info',
  delete: 'destructive',
  login: 'secondary',
  logout: 'outline',
  login_failed: 'destructive',
  export: 'warning',
  permission_change: 'warning',
  read_confidential: 'warning',
  merge: 'info',
};

function changeSummary(entry: AuditLogEntry): string {
  const count = (v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).length : 0;
  const parts: string[] = [];
  const changed = Math.max(count(entry.oldValues), count(entry.newValues));
  if (changed > 0) parts.push(`${changed} field${changed === 1 ? '' : 's'}`);
  if (count(entry.metadata) > 0) parts.push('metadata');
  return parts.join(' + ') || '—';
}

export function AuditLogPage() {
  const { can } = useAuth();

  const { values, draft, set, listState, onListStateChange, clear, isFiltered } = useListParams({
    userId: P.id(),
    entityType: P.text(),
    /**
     * P.id(), so a mistyped or truncated uuid is dropped rather than sent. The
     * API 400s on a malformed uuid, which would take out the whole screen for
     * what is a typo in one field.
     */
    entityId: P.id(),
    action: P.choice(AUDIT_ACTIONS, ''),
    from: P.date(),
    to: P.date(),
  });
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);


  // The user filter needs the /admin/users lookup; audit.read alone may not
  // hold admin.users, so the dropdown degrades to a hidden control.
  const canListUsers = can('admin.users');
  const { users, isLoading: usersLoading } = useActiveUserOptions(canListUsers);

  const params = {
    page: listState.page,
    pageSize: listState.pageSize,
    userId: values.userId,
    // `values`, not `draft`: the query waits for typing to settle.
    entityType: values.entityType,
    entityId: values.entityId,
    action: values.action,
    from: values.from,
    to: values.to,
  };

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin', 'audit', params],
    queryFn: () => api.get<Paged<AuditLogEntry>>(`/admin/audit-logs${qs(params)}`),
    enabled: can('audit.read'),
    // Rows stay put through a page or filter change; DataTable dims them.
    placeholderData: keepPreviousData,
  });

  if (!can('audit.read')) {
    return <NoAccess reason="Requires the audit.read permission." />;
  }

  // Server always sorts newest-first; no sortKeys on purpose.
  const columns: Column<AuditLogEntry>[] = [
    {
      key: 'createdAt',
      header: 'Time',
      className: 'whitespace-nowrap',
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: 'user',
      header: 'User',
      render: (row) =>
        row.user ? (
          <div>
            <div className="font-medium">
              {row.user.firstName} {row.user.lastName}
            </div>
            <div className="text-xs text-muted-foreground">{row.user.email}</div>
          </div>
        ) : (
          <span className="text-muted-foreground">System</span>
        ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <Badge variant={ACTION_VARIANTS[row.action] ?? 'secondary'}>{humanize(row.action)}</Badge>
      ),
    },
    {
      key: 'entity',
      header: 'Entity',
      render: (row) => (
        <div>
          <div className="text-sm">{humanize(row.entityType)}</div>
          {row.entityId ? (
            <div className="max-w-[16rem] truncate font-mono text-xs text-muted-foreground">
              {row.entityId}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'changes',
      header: 'Changes',
      render: (row) => <span className="text-sm text-muted-foreground">{changeSummary(row)}</span>,
    },
    {
      // The row click was the ONLY way to open the entry detail, so a keyboard or
      // screen-reader user could not read an audit entry at all. The label names
      // the entry: 25 buttons all reading "View" tell a screen-reader user
      // nothing about which row they are on.
      key: 'actions',
      header: '',
      className: 'w-20 text-right',
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`View audit entry: ${humanize(row.action)} ${humanize(row.entityType)} on ${formatDateTime(row.createdAt)}`}
          onClick={(e) => {
            e.stopPropagation();
            setSelected(row);
          }}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader title="Audit Log" />

      <ListToolbar className="items-end">
        {canListUsers ? (
          <div className="w-full space-y-1 sm:w-56">
            <Label className="text-xs text-muted-foreground">User</Label>
            <FilterSelect
              aria-label="User"
              className="w-full"
              value={values.userId}
              onChange={(value) => set('userId', value)}
            >
              <option value="">All users</option>
              {/* The user options are capped at 200 and active-only, so an id
                  from a link may be absent — a deactivated author, most likely.
                  Must be a DIRECT child; see filter-select.tsx. */}
              {unresolvedOptionLabel(values.userId, users, usersLoading) ? (
                <option value={values.userId}>
                  {unresolvedOptionLabel(values.userId, users, usersLoading)}
                </option>
              ) : null}
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName}
                </option>
              ))}
            </FilterSelect>
          </div>
        ) : null}
        <div className="w-full space-y-1 sm:w-44">
          <Label className="text-xs text-muted-foreground">Entity type</Label>
          <Input
            className="w-full"
            placeholder="e.g. user, participant…"
            value={draft.entityType}
            onChange={(e) => set('entityType', e.target.value)}
          />
        </div>
        <div className="w-full space-y-1 sm:w-44">
          <Label className="text-xs text-muted-foreground">Entity ID</Label>
          <Input
            className="w-full"
            placeholder="UUID"
            value={values.entityId}
            onChange={(e) => set('entityId', e.target.value)}
          />
        </div>
        <div className="w-full space-y-1 sm:w-44">
          <Label className="text-xs text-muted-foreground">Action</Label>
          <FilterSelect
            aria-label="Action"
            className="w-full"
            value={values.action}
            onChange={(value) => set('action', value as (typeof AUDIT_ACTIONS)[number] | '')}
          >
            <option value="">All actions</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {humanize(a)}
              </option>
            ))}
          </FilterSelect>
        </div>
        <div className="w-full space-y-1 sm:w-40">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input
            type="date"
            className="w-full"
            value={values.from}
            onChange={(e) => set('from', e.target.value)}
          />
        </div>
        <div className="w-full space-y-1 sm:w-40">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input
            type="date"
            className="w-full"
            value={values.to}
            onChange={(e) => set('to', e.target.value)}
          />
        </div>
      </ListToolbar>

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        isFetching={isFetching}
        state={listState}
        onStateChange={onListStateChange}
        onRowClick={setSelected}
        isFiltered={isFiltered}
        onClearFilters={clear}
        emptyMessage="No audit entries match the filters"
      />

      <Dialog open={selected !== null} onOpenChange={(next) => (!next ? setSelected(null) : undefined)}>
        <DialogContent size="2xl">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {humanize(selected.action)} — {humanize(selected.entityType)}
                </DialogTitle>
                <DialogDescription>
                  {formatDateTime(selected.createdAt)}
                  {selected.user
                    ? ` · ${selected.user.firstName} ${selected.user.lastName} (${selected.user.email})`
                    : ' · System'}
                  {selected.ipAddress ? ` · ${selected.ipAddress}` : ''}
                </DialogDescription>
              </DialogHeader>
              {selected.entityId ? (
                <p className="font-mono text-xs text-muted-foreground">
                  Entity ID: {selected.entityId}
                </p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Old values</Label>
                  <JsonBlock value={selected.oldValues} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">New values</Label>
                  <JsonBlock value={selected.newValues} />
                </div>
              </div>
              {selected.metadata !== null && selected.metadata !== undefined ? (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Metadata</Label>
                  <JsonBlock value={selected.metadata} />
                </div>
              ) : null}
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelected(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
