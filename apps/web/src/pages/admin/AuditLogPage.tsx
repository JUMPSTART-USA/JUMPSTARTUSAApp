import { AUDIT_ACTIONS } from '@jumpstart/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
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
import { Input, Label, Select } from '@/components/ui/input';
import { EmptyState, ErrorState } from '@/components/ui/spinner';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { humanize } from '@/lib/utils';
import { formatDateTime, JsonBlock, useActiveUserOptions, useDebouncedValue } from './shared';
import type { AuditLogEntry } from './types';

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

  const [listState, setListState] = useState<ListState>(initialListState);
  const [userId, setUserId] = useState('');
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);

  const debouncedEntityType = useDebouncedValue(entityType);
  const debouncedEntityId = useDebouncedValue(entityId);

  // The user filter needs the /admin/users lookup; audit.read alone may not
  // hold admin.users, so the dropdown degrades to a hidden control.
  const canListUsers = can('admin.users');
  const { users } = useActiveUserOptions(canListUsers);

  const params = {
    page: listState.page,
    pageSize: listState.pageSize,
    userId,
    entityType: debouncedEntityType,
    entityId: debouncedEntityId,
    action,
    from,
    to,
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'audit', params],
    queryFn: () => api.get<Paged<AuditLogEntry>>(`/admin/audit-logs${qs(params)}`),
    enabled: can('audit.read'),
  });

  if (!can('audit.read')) {
    return <EmptyState title="No access" hint="Requires the audit.read permission." />;
  }

  const resetPage = () => setListState((s) => ({ ...s, page: 1 }));

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
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Audit Log</h2>

      <div className="flex flex-wrap items-end gap-2">
        {canListUsers ? (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">User</Label>
            <Select
              className="w-52"
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                resetPage();
              }}
            >
              <option value="">All users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Entity type</Label>
          <Input
            className="w-44"
            placeholder="e.g. user, participant…"
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              resetPage();
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Entity ID</Label>
          <Input
            className="w-44"
            placeholder="UUID"
            value={entityId}
            onChange={(e) => {
              setEntityId(e.target.value);
              resetPage();
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Action</Label>
          <Select
            className="w-44"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              resetPage();
            }}
          >
            <option value="">All actions</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {humanize(a)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input
            type="date"
            className="w-40"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              resetPage();
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input
            type="date"
            className="w-40"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              resetPage();
            }}
          />
        </div>
      </div>

      {error ? <ErrorState error={error} /> : null}

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        state={listState}
        onStateChange={setListState}
        onRowClick={setSelected}
        emptyMessage="No audit entries match the filters"
      />

      <Dialog open={selected !== null} onOpenChange={(next) => (!next ? setSelected(null) : undefined)}>
        <DialogContent className="max-w-3xl">
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
