import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/utils';
import type { SyncRun } from '../types';

const RUN_VARIANTS: Record<SyncRun['status'], BadgeProps['variant']> = {
  running: 'warning',
  success: 'success',
  failed: 'destructive',
};

/** Latest Bloomerang mirror run (§6.8); Sync now is admin-only. */
export function SyncStatusChip() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const runsQuery = useQuery({
    queryKey: ['crm', 'sync', 'runs'],
    queryFn: () => api.get<SyncRun[]>('/sync/runs'),
    refetchInterval: (query) =>
      query.state.data?.[0]?.status === 'running' ? 5_000 : false,
  });
  const latest = runsQuery.data?.[0];

  const syncNow = useMutation({
    mutationFn: () => api.post<SyncRun>('/sync/bloomerang'),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['crm'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Sync failed'),
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {latest ? (
          <>
            <Badge variant={RUN_VARIANTS[latest.status]} title={latest.error ?? undefined}>
              Bloomerang sync: {latest.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatDate(latest.finishedAt ?? latest.startedAt)}
            </span>
          </>
        ) : (
          <Badge variant="outline">Bloomerang: never synced</Badge>
        )}
        {can('admin.settings') ? (
          <Button
            variant="outline"
            size="sm"
            disabled={syncNow.isPending || latest?.status === 'running'}
            onClick={() => syncNow.mutate()}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Sync now
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">{error}</p>
      ) : null}
    </div>
  );
}
