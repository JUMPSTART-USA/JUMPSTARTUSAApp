import { useQuery } from '@tanstack/react-query';
import { EntityPicker, type PickerOption } from '@/components/ui/entity-picker';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, fullName } from '@/lib/utils';
import type { Campaign, DonorCrmStatus, PersonRef } from './types';

export function ProgressBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">No goal set</span>;
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full max-w-[160px] overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', pct >= 100 ? 'bg-success' : 'bg-primary')}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
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
  const canParticipants = can('participants.read');
  const canVolunteers = can('volunteers.read');

  if (!canParticipants && !canVolunteers) {
    return (
      <p className="text-xs text-muted-foreground">
        You do not have permission to search people records.
      </p>
    );
  }

  return (
    <EntityPicker
      value={
        selected
          ? { id: selected.personId, label: selected.name, sublabel: selected.source }
          : null
      }
      onChange={(option) =>
        onSelect(
          option
            ? { personId: option.id, name: option.label, source: option.sublabel ?? '' }
            : null,
        )
      }
      queryKey={`crm-person-${canParticipants}-${canVolunteers}`}
      placeholder={placeholder ?? 'Search by name or email…'}
      search={async (term) => {
        const search = qs({ search: term, pageSize: 8 });
        const [participants, volunteers] = await Promise.all([
          canParticipants
            ? api.get<Paged<{ id: string; person: PersonRef | null }>>(`/participants${search}`)
            : Promise.resolve(undefined),
          canVolunteers
            ? api.get<Paged<{ id: string; person: PersonRef | null }>>(`/volunteers${search}`)
            : Promise.resolve(undefined),
        ]);
        const hits = new Map<string, PickerOption>();
        for (const item of participants?.items ?? []) {
          if (item.person) {
            hits.set(item.person.id, {
              id: item.person.id,
              label: fullName(item.person),
              sublabel: 'Participant',
            });
          }
        }
        for (const item of volunteers?.items ?? []) {
          if (item.person && !hits.has(item.person.id)) {
            hits.set(item.person.id, {
              id: item.person.id,
              label: fullName(item.person),
              sublabel: 'Volunteer',
            });
          }
        }
        return [...hits.values()];
      }}
    />
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
