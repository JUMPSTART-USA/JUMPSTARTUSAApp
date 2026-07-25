import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { api, ApiError, qs, type Paged } from '@/lib/api';
import type { AdminUser } from './types';

/** Debounce for filter inputs so list queries don't fire per keystroke. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * Maps ApiError.errors into react-hook-form fields (same paths — the API
 * validates with the same shared schema) and returns a top-level message for
 * anything that can't be attached to a field.
 */
export function applyApiFormErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
): string {
  if (err instanceof ApiError) {
    if (err.errors && err.errors.length > 0) {
      for (const e of err.errors) setError(e.path as Path<T>, { message: e.message });
      return 'Please fix the highlighted fields';
    }
    return err.message;
  }
  return err instanceof Error ? err.message : 'Request failed';
}

/** Audit rows need the time of day, not just the date. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'MMM d, yyyy h:mm a');
}

export function WarningNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {children}
    </div>
  );
}

export function ErrorNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-red-50 px-3 py-2 text-sm text-destructive">
      {children}
    </div>
  );
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
