import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/utils';
import type { DonorCrmStatus, SyncRun } from '../types';

const RUN_VARIANTS: Record<SyncRun['status'], BadgeProps['variant']> = {
  running: 'warning',
  success: 'success',
  failed: 'destructive',
};

/**
 * Latest donor-CRM mirror run for the configured provider (§6.8); Sync now is
 * admin-only. Renders nothing when no provider is configured.
 */
export function SyncStatusChip() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ['crm', 'sync', 'status'],
    queryFn: () => api.get<DonorCrmStatus>('/sync/status'),
    refetchInterval: (query) =>
      query.state.data?.latest?.status === 'running' ? 5_000 : false,
  });
  const status = statusQuery.data;
  const latest = status?.latest;

  const syncNow = useMutation({
    mutationFn: () => api.post<SyncRun>(`/sync/${status?.provider}`),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['crm'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Sync failed'),
  });

  if (!status || status.provider === 'none') return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {latest ? (
          <>
            <Badge variant={RUN_VARIANTS[latest.status]} title={latest.error ?? undefined}>
              {status.providerLabel} sync: {latest.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatDate(latest.finishedAt ?? latest.startedAt)}
            </span>
          </>
        ) : (
          <Badge variant="outline">{status.providerLabel}: never synced</Badge>
        )}
        {can('admin.settings') ? (
          <Button
            variant="outline"
            size="sm"
            title={status.configured ? undefined : 'API credentials not configured on the server'}
            disabled={syncNow.isPending || latest?.status === 'running'}
            onClick={() => syncNow.mutate()}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Sync now
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
