import { useEffect, useState } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from '@/lib/api';

/** Small debounce for search inputs so typing doesn't spam the list endpoint. */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
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
