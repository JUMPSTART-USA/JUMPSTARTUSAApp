import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { api, ApiError, qs, type Paged } from '@/lib/api';
import type { InstitutionOption } from './types';

/** Small debounce for search inputs so typing doesn't spam the list endpoint. */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/** ISO date/datetime string → yyyy-MM-dd for <Input type="date"> values. */
export function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

/** Map an ApiError into the form: field errors by path, otherwise a top-level message. */
export function applyApiError<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  setTopLevel: (msg: string) => void,
) {
  if (err instanceof ApiError) {
    if (err.errors?.length) {
      for (const fieldError of err.errors) {
        setError(fieldError.path as Path<T>, { type: 'server', message: fieldError.message });
      }
      return;
    }
    setTopLevel(err.message);
    return;
  }
  setTopLevel('Request failed — try again');
}

/** Institution options for filter/form selects (name-sorted, first 200). */
export function useInstitutionOptions() {
  return useQuery({
    queryKey: ['inside-classes', 'institution-options'],
    queryFn: () =>
      api.get<Paged<InstitutionOption>>(`/institutions${qs({ pageSize: 200, sortBy: 'name' })}`),
    staleTime: 5 * 60 * 1000,
  });
}
