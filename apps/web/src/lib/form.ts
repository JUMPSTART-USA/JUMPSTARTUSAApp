/**
 * Canonical form helpers for every CRUD screen. One debounce hook, one
 * resolver, one API-error mapper, one date formatter — module-local copies
 * of these are migration debt; import from here instead.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import type { FieldValues, Path, Resolver, UseFormSetError } from 'react-hook-form';
import type { z } from 'zod';
import { ApiError } from '@/lib/api';

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
 * with the API — and handleSubmit receives the parsed output.
 */
export function formResolver<T extends FieldValues>(schema: z.ZodTypeAny): Resolver<T> {
  const inner = zodResolver(schema) as unknown as Resolver<T>;
  return (values, context, options) => inner(cleanEmpty(values) as T, context, options);
}

/**
 * Maps ApiError.errors into the form (paths match: the API validates the same
 * schema, so 'person.firstName' style paths line up with RHF field paths).
 * Returns a top-level message to display, or null when everything mapped to
 * fields. Render the result with <FormError message={...} />.
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

/**
 * Today as 'yyyy-MM-dd' for date-input defaults, in the USER'S timezone.
 *
 * Deliberately not `toISOString().slice(0, 10)`: that yields the UTC date, so
 * from 8pm Eastern (5pm Pacific — during working hours on the west coast) it
 * returns TOMORROW. A case manager logging a service at 9pm Monday got Tuesday
 * pre-filled and saved it, and the record was permanently misdated. A date-only
 * field has no timezone, so "today" has to be read off the local clock.
 */
export function todayInput(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Compare a date-only 'yyyy-MM-dd' value against today without going through
 * Date at all. `new Date('2026-08-10')` parses as UTC midnight, so comparing it
 * to `Date.now()` puts the boundary at 8pm Eastern rather than midnight local —
 * which made expiry badges flip a day early or late. Lexical comparison of two
 * 'yyyy-MM-dd' strings is exact and timezone-free.
 *
 * Returns a negative number if `value` is before today, 0 if it is today, and a
 * positive number if it is after.
 */
export function compareToToday(value: string | null | undefined): number {
  if (!value) return NaN;
  const date = value.slice(0, 10);
  const today = todayInput();
  return date < today ? -1 : date > today ? 1 : 0;
}
