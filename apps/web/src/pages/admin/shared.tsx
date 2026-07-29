import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { api, qs, type Paged } from '@/lib/api';
import type { AdminUser } from './types';

/** Audit rows need the time of day, not just the date. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'MMM d, yyyy h:mm a');
}

/** Compact JSON viewer for audit values and setting payloads. */
export function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <pre className="max-h-64 overflow-auto rounded-md bg-muted px-3 py-2 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** Active users, used for deactivation reassignment and the audit user filter. */
export function useActiveUserOptions(enabled: boolean) {
  const query = useQuery({
    queryKey: ['admin', 'users', 'options', 'active'],
    queryFn: () =>
      api.get<Paged<AdminUser>>(`/admin/users${qs({ status: 'active', pageSize: 200 })}`),
    enabled,
    staleTime: 60 * 1000,
  });
  return { users: query.data?.items ?? [], isLoading: query.isLoading };
}
