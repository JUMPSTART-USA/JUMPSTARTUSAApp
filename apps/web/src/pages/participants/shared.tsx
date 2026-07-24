import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import type { FieldValues, Path, Resolver, UseFormSetError } from 'react-hook-form';
import type { z } from 'zod';
import { api, ApiError, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

/** '' → undefined, recursively: the shared schemas treat undefined as "not
 * provided", and enum/uuid fields reject empty strings from blank selects. */
function cleanEmpty(value: unknown): unknown {
  if (value === '') return undefined;
  if (Array.isArray(value)) return value.map(cleanEmpty);
  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, cleanEmpty(v)]),
    );
  }
  return value;
}

/**
 * zodResolver typed to the form's RAW field values (strings from date inputs,
 * '' from blank selects). The shared schema coerces/validates — one rule set
 * with the API (§3.1) — and handleSubmit receives the parsed output.
 */
export function schemaResolver<T extends FieldValues>(schema: z.ZodTypeAny): Resolver<T> {
  const inner = zodResolver(schema) as unknown as Resolver<T>;
  return (values, context, options) => inner(cleanEmpty(values) as T, context, options);
}

/**
 * Maps ApiError.errors into the form (paths match: the API validates the same
 * schema, so 'person.firstName' style paths line up with RHF field paths).
 * Returns a top-level message to display when there is nothing to map.
 */
export function applyApiError<T extends FieldValues>(
  err: unknown,
  setError?: UseFormSetError<T>,
): string | null {
  if (err instanceof ApiError) {
    if (err.errors?.length && setError) {
      for (const e of err.errors) {
        setError(e.path as Path<T>, { type: 'server', message: e.message });
      }
      return null;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : 'Request failed';
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** ISO datetime/date string → 'yyyy-MM-dd' for <Input type="date">. */
export function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

export interface CaseManagerOption {
  id: string;
  name: string;
}

/**
 * Options for the "assigned case manager" select. There is no general staff
 * lookup endpoint: /admin/users needs admin.users; /caseload-summary
 * (case_management.read) is the fallback but only lists CMs who currently
 * hold a caseload. `extra` merges the currently-assigned CM into the list.
 */
export function useCaseManagerOptions(extra?: CaseManagerOption | null): {
  options: CaseManagerOption[];
  isLoading: boolean;
} {
  const { can } = useAuth();
  const canAdmin = can('admin.users');
  const canCaseload = can('case_management.read');

  const admin = useQuery({
    queryKey: ['participants', 'case-manager-options', 'admin-users'],
    queryFn: () =>
      api.get<Paged<UserRow>>(`/admin/users${qs({ pageSize: 200, status: 'active' })}`),
    enabled: canAdmin,
    staleTime: 5 * 60 * 1000,
  });
  const summary = useQuery({
    queryKey: ['participants', 'case-manager-options', 'caseload-summary'],
    queryFn: () => api.get<CaseloadSummaryRow[]>('/caseload-summary'),
    enabled: !canAdmin && canCaseload,
    staleTime: 5 * 60 * 1000,
  });

  const options: CaseManagerOption[] = canAdmin
    ? (admin.data?.items ?? []).map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}` }))
    : (summary.data ?? []).map((r) => ({ id: r.caseManagerId, name: r.caseManagerName }));

  if (extra && !options.some((o) => o.id === extra.id)) options.unshift(extra);

  return { options, isLoading: canAdmin ? admin.isLoading : canCaseload && summary.isLoading };
}

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
}

interface CaseloadSummaryRow {
  caseManagerId: string;
  caseManagerName: string;
}

// ── Small display primitives ─────────────────────────────────────────────────

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

/** Amber notice for warnings and duplicate/override flows — never swallowed. */
export function AmberNotice({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900',
        className,
      )}
    >
      {children}
    </div>
  );
}
