import { useEffect, useState } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';

/** Debounce for search inputs so list queries don't fire per keystroke. */
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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Expiry rendering used across trainings, clearances and checks: red once
 * lapsed, amber inside the warning window, plain date otherwise.
 */
export function ExpiryBadge({
  date,
  warnDays = 60,
  emptyLabel = 'Never expires',
}: {
  date: string | null | undefined;
  warnDays?: number;
  emptyLabel?: string;
}) {
  if (!date) return <span className="text-muted-foreground">{emptyLabel}</span>;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return <span className="text-muted-foreground">—</span>;
  const now = Date.now();
  if (d.getTime() < now) return <Badge variant="destructive">Expired {formatDate(date)}</Badge>;
  if (d.getTime() - now <= warnDays * DAY_MS)
    return <Badge variant="warning">Expires {formatDate(date)}</Badge>;
  return <span>{formatDate(date)}</span>;
}

/** ISO datetime → value for <Input type="date">. */
export function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

/** Amber notice block for warnings / soft-block messages (never swallowed). */
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
