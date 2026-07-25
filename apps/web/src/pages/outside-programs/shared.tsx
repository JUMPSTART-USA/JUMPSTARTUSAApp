/**
 * Small helpers shared by the Outside Programs and Housing areas (both owned
 * by this module group — Housing imports from here rather than duplicating).
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { FieldValues, Path, Resolver, UseFormSetError } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { api, ApiError, qs, type Paged } from '@/lib/api';
import { fullName } from '@/lib/utils';
import type { ParticipantRef } from './types';

/**
 * Zod resolver typed against string-based form values: date/number inputs hold
 * strings and the shared schemas coerce them, so the resolver's static types
 * (post-coercion Date/number) never match RHF's field values exactly.
 */
export function formResolver<T extends FieldValues>(schema: z.ZodTypeAny): Resolver<T> {
  return zodResolver(schema) as unknown as Resolver<T>;
}

/** register(..., { setValueAs: emptyToUndef }) for optional enum/uuid/number selects. */
export const emptyToUndef = (v: unknown) => (v === '' || v === null ? undefined : v);

export function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

/** ISO timestamp → value for <Input type="date">. */
export function dateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

/**
 * Maps an ApiError's field errors into the form; returns the message to show
 * as a top-level notice (or null when everything mapped to a field).
 */
export function applyApiError<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
): string | null {
  if (err instanceof ApiError) {
    if (err.errors?.length) {
      const unmapped: string[] = [];
      for (const e of err.errors) {
        if (e.path) setError(e.path as Path<T>, { type: 'server', message: e.message });
        else unmapped.push(e.message);
      }
      return unmapped.length ? unmapped.join('; ') : null;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : 'Request failed';
}

/** Amber notice for API warnings — surfaced, never swallowed (§6.3/§6.4). */
export function WarningNotice({ warnings }: { warnings: string[] | undefined }) {
  if (!warnings?.length) return null;
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <ul className="list-disc space-y-1 pl-4">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

export function FormErrorNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-md border border-destructive/30 bg-red-50 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}

/** Definition-list row for detail cards. */
export function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function participantLabel(p: ParticipantRef): string {
  return `${fullName(p.person)} · ${p.participantNumber}`;
}

/**
 * Search-and-pick a participant by name/number. Selection is surfaced to the
 * parent form via onSelect; the parent stores participantProfileId.
 */
export function ParticipantPicker({
  value,
  onSelect,
  queryScope = 'outside-programs',
}: {
  value: ParticipantRef | null;
  onSelect: (p: ParticipantRef | null) => void;
  queryScope?: string;
}) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);

  const { data, isFetching, error } = useQuery({
    queryKey: [queryScope, 'participant-picker', debounced],
    queryFn: () =>
      api.get<Paged<ParticipantRef>>(`/participants${qs({ search: debounced, pageSize: 10 })}`),
    enabled: debounced.trim().length >= 2,
  });

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <span className="font-medium">{participantLabel(value)}</span>
        <Button variant="ghost" size="sm" onClick={() => onSelect(null)}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          placeholder="Search by name or participant number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          // The picker lives inside dialog forms — Enter must not submit them.
          onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
        />
        {isFetching ? <Spinner className="absolute right-2.5 top-2.5 h-4 w-4" /> : null}
      </div>
      {error ? (
        <p className="text-xs text-destructive">
          {error instanceof Error ? error.message : 'Search failed'}
        </p>
      ) : null}
      {data && debounced.trim().length >= 2 ? (
        data.items.length ? (
          <div className="max-h-48 divide-y overflow-y-auto rounded-md border">
            {data.items.map((p) => (
              <button
                key={p.id}
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => onSelect(p)}
              >
                <span>{fullName(p.person)}</span>
                <span className="text-xs text-muted-foreground">{p.participantNumber}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No participants match “{debounced}”.</p>
        )
      ) : null}
    </div>
  );
}

/** Destructive-action confirm; keeps 409 messages visible (never swallowed). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  onConfirm,
  busy,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  busy?: boolean;
  error?: unknown;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error ? (
          <FormErrorNotice
            message={error instanceof Error ? error.message : 'Request failed'}
          />
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
