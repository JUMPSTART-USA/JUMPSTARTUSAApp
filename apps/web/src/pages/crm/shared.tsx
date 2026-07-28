import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { api, ApiError, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, fullName } from '@/lib/utils';
import type { Campaign, DonorCrmStatus, PersonRef } from './types';

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Maps ApiError field errors onto the form; returns a top-level message for
 * errors that have no field path (or non-Api failures).
 */
export function applyApiErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
): string | null {
  if (err instanceof ApiError) {
    if (err.errors?.length) {
      for (const fieldError of err.errors) {
        setError(fieldError.path as Path<T>, { message: fieldError.message });
      }
      return null;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : 'Request failed';
}

export function ProgressBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">No goal set</span>;
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full max-w-[160px] overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', pct >= 100 ? 'bg-emerald-500' : 'bg-primary')}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

export function InfoItem({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children ?? '—'}</dd>
    </div>
  );
}

/** All campaigns for select controls — small dataset, cached per session. */
export function useCampaignOptions() {
  return useQuery({
    queryKey: ['crm', 'campaigns', 'options'],
    queryFn: () =>
      api.get<Paged<Campaign>>(`/campaigns${qs({ pageSize: 200, sortBy: 'name', sortDir: 'asc' })}`),
    staleTime: 60_000,
  });
}

export interface PersonHit {
  personId: string;
  name: string;
  source: string;
}

/**
 * Person lookup across the records this user can already read (participants
 * and volunteers) — there is no standalone person-search endpoint.
 */
export function PersonSearch({
  selected,
  onSelect,
  placeholder,
}: {
  selected: PersonHit | null;
  onSelect: (hit: PersonHit | null) => void;
  placeholder?: string;
}) {
  const { can } = useAuth();
  const [term, setTerm] = useState('');
  const debounced = useDebouncedValue(term);
  const canParticipants = can('participants.read');
  const canVolunteers = can('volunteers.read');
  const enabled = !selected && debounced.trim().length >= 2 && (canParticipants || canVolunteers);

  const { data, isFetching } = useQuery({
    queryKey: ['crm', 'person-search', debounced, canParticipants, canVolunteers],
    enabled,
    queryFn: async () => {
      const search = qs({ search: debounced, pageSize: 8 });
      const [participants, volunteers] = await Promise.all([
        canParticipants
          ? api.get<Paged<{ id: string; person: PersonRef | null }>>(`/participants${search}`)
          : Promise.resolve(undefined),
        canVolunteers
          ? api.get<Paged<{ id: string; person: PersonRef | null }>>(`/volunteers${search}`)
          : Promise.resolve(undefined),
      ]);
      const hits = new Map<string, PersonHit>();
      for (const item of participants?.items ?? []) {
        if (item.person) {
          hits.set(item.person.id, {
            personId: item.person.id,
            name: fullName(item.person),
            source: 'Participant',
          });
        }
      }
      for (const item of volunteers?.items ?? []) {
        if (item.person && !hits.has(item.person.id)) {
          hits.set(item.person.id, {
            personId: item.person.id,
            name: fullName(item.person),
            source: 'Volunteer',
          });
        }
      }
      return [...hits.values()];
    },
  });

  if (!canParticipants && !canVolunteers) {
    return (
      <p className="text-xs text-muted-foreground">
        You do not have permission to search people records.
      </p>
    );
  }

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-1.5 text-sm">
        <span>{selected.name}</span>
        <Button variant="ghost" size="sm" onClick={() => onSelect(null)}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder={placeholder ?? 'Search by name or email…'}
        className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {enabled ? (
        <div className="max-h-40 overflow-y-auto rounded-md border">
          {isFetching ? (
            <div className="p-2">
              <Spinner className="mx-auto h-4 w-4" />
            </div>
          ) : !data || data.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground">No matches</p>
          ) : (
            data.map((hit) => (
              <button
                key={hit.personId}
                type="button"
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => onSelect(hit)}
              >
                <span>{hit.name}</span>
                <span className="text-xs text-muted-foreground">{hit.source}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Active donor CRM (§6.8). When a provider is configured, donors/donations/
 * campaigns/events are read-only mirrors — pages hide create/edit/delete and
 * offer local-field editing only.
 */
export function useDonorCrm() {
  const query = useQuery({
    queryKey: ['crm', 'sync', 'status'],
    queryFn: () => api.get<DonorCrmStatus>('/sync/status'),
  });
  const provider = query.data?.provider;
  return {
    provider,
    label: query.data?.providerLabel ?? null,
    // Treat "unknown yet" as mirrored so edit affordances never flash in.
    mirrored: provider === undefined ? true : provider !== 'none',
  };
}
