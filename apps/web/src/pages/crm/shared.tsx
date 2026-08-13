import { useQuery } from '@tanstack/react-query';
import { StatusBadge } from '@/components/ui/badge';
import { Meter } from '@/components/ui/meter';
import {
  EntityPicker,
  useRehydratedValue,
  useRememberOption,
  type PickerOption,
  type RehydratedValue,
  type RehydrationStatus,
} from '@/components/ui/entity-picker';
import { StatTile as KitStatTile } from '@/components/ui/stat';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, fullName } from '@/lib/utils';
import type {
  AppealListItem,
  Campaign,
  DonorLifecycle,
  DonorListItem,
  FundListItem,
  PersonRef,
} from './types';

/**
 * Campaign/appeal progress toward a goal.
 *
 * Reaching 100% is GOOD here, which is why the tone rule lives at this call site
 * and not in the kit's Meter: housing's OccupancyBar draws the same bar and
 * means the opposite by a full one. See the note in components/ui/meter.tsx.
 */
export function ProgressBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">No goal set</span>;
  return (
    <div className="flex items-center gap-2">
      <Meter pct={pct} tone={pct >= 100 ? 'success' : 'primary'} className="max-w-[160px]" />
      <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

/**
 * Compact label + value tile for giving-summary rows — the kit's `StatTile`
 * wearing this module's older prop shape.
 *
 * The adapter is here rather than at the call sites because the ONLY difference
 * is where the value arrives: nineteen sites across the three donor screens
 * spell it `<StatTile label="Lifetime">{formatMoney(…)}</StatTile>`, and
 * rewriting all of them to `value={…}` would spread a change that moves nothing
 * on screen across the CRM, burying the pixel-for-pixel claim in a diff too
 * large to check it against. `size` is pinned, not forwarded: `sm` is text-lg,
 * which is what every one of those sites renders today, and a size a call site
 * can pass is a size that eventually differs from the one beside it.
 *
 * The output is identical, not merely close. The kit's value line also carries
 * `leading-tight`, but twMerge drops it — `text-lg` sets its own line-height and
 * arrives later in the `cn()` call — so these values keep the 1.75rem line they
 * have now. That is worth knowing before reordering `cn()`'s arguments in
 * stat.tsx: `leading-tight` would start winning and every giving summary would
 * tighten by 5px with no diff in this file.
 */
export function StatTile({ label, children }: { label: string; children: React.ReactNode }) {
  return <KitStatTile label={label} value={children} size="sm" />;
}

/**
 * Computed giving-lifecycle badge (prospective/new/active/lapsed/inactive).
 *
 * All five labels were exactly what humanize() produces, and the colours were
 * the canonical ones, so the local map folded into STATUS_VARIANTS with no
 * pixel change — including the em dash StatusBadge already renders for a donor
 * with no computed lifecycle.
 */
export function LifecycleBadge({ lifecycle }: { lifecycle: DonorLifecycle | null | undefined }) {
  return <StatusBadge status={lifecycle} />;
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

/** Funds for select controls. Pass activeOnly=false for filter dropdowns. */
export function useFundOptions(activeOnly = true) {
  return useQuery({
    queryKey: ['crm', 'funds', 'options', activeOnly],
    queryFn: () =>
      api.get<Paged<FundListItem>>(
        `/funds${qs({ pageSize: 200, active: activeOnly ? 'true' : undefined })}`,
      ),
    staleTime: 60_000,
  });
}

/** Appeals for select controls, optionally narrowed to a campaign. */
export function useAppealOptions(campaignId?: string, activeOnly = true) {
  return useQuery({
    queryKey: ['crm', 'appeals', 'options', campaignId ?? '', activeOnly],
    queryFn: () =>
      api.get<Paged<AppealListItem>>(
        `/appeals${qs({
          pageSize: 200,
          campaignId,
          active: activeOnly ? 'true' : undefined,
        })}`,
      ),
    staleTime: 60_000,
  });
}

/** Cache namespace an id resolves under — see the pickers module for why this
 *  is separate from the search's namespace. */
const DONOR = 'donor';

/** Shared by the typeahead and the rehydration lookup, so a filter chip and a
 *  search result can never spell the same donor differently. */
const donorOption = (donor: DonorListItem): PickerOption => ({
  id: donor.id,
  label: donor.name,
  sublabel: donor.email ?? undefined,
});

/** Debounced donor search-and-pick — the standard donor control (§6.8). */
export function DonorPicker({
  value,
  status,
  onRetry,
  onChange,
  placeholder,
  disabled,
  id,
}: {
  value: PickerOption | null;
  /** Set by `useDonorOption` when the value came from the URL. */
  status?: RehydrationStatus;
  onRetry?: () => void;
  onChange: (option: PickerOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Forwarded to the inner control so a FormField label can target it. */
  id?: string;
}) {
  const remember = useRememberOption(DONOR);
  return (
    <EntityPicker
      id={id}
      value={value}
      status={status}
      onRetry={onRetry}
      onChange={(option) => {
        remember(option);
        onChange(option);
      }}
      chapterScoped
      queryKey="crm-donor-picker"
      placeholder={placeholder ?? 'Search donors…'}
      disabled={disabled}
      search={async (term) => {
        const page = await api.get<Paged<DonorListItem>>(
          `/donors${qs({ search: term, pageSize: 8 })}`,
        );
        return page.items.map(donorOption);
      }}
    />
  );
}

/**
 * The name behind a `?donorId=` in the URL. Spread into DonorPicker.
 *
 * Resolves through `/donors?id=`, the same chapter-scoped list the typeahead
 * searches, so another chapter's donor comes back as an empty page rather than a
 * 404 — see useRehydratedValue.
 */
export function useDonorOption(id: string): RehydratedValue {
  return useRehydratedValue(DONOR, id, async (donorId) => {
    const page = await api.get<Paged<DonorListItem>>(`/donors${qs({ id: donorId, pageSize: 1 })}`);
    const donor = page.items[0];
    return donor ? donorOption(donor) : null;
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
/**
 * The person behind a `?personId=` in the URL.
 *
 * Unlike the other pickers there is no single person endpoint — PersonSearch
 * looks across participants AND volunteers, because a person can be both. So
 * this asks the same two lists, by `personId`, and takes whichever answers
 * first; the label is the same either way, and "Participant" wins the sublabel
 * when both do, matching what the typeahead shows.
 *
 * Permission-gated the same way the search is: a viewer who can read neither
 * list resolves nothing, which the picker renders as a record they cannot view.
 */
export function usePersonOption(personId: string): {
  value: PersonHit | null;
  status: RehydrationStatus;
  onRetry?: () => void;
} {
  const { can } = useAuth();
  const canParticipants = can('participants.read');
  const canVolunteers = can('volunteers.read');

  const rehydrated = useRehydratedValue(
    `person-${canParticipants}-${canVolunteers}`,
    personId,
    async (id) => {
      const query = qs({ personId: id, pageSize: 1 });
      const [participants, volunteers] = await Promise.all([
        canParticipants
          ? api.get<Paged<{ person: PersonRef | null }>>(`/participants${query}`)
          : Promise.resolve(undefined),
        canVolunteers
          ? api.get<Paged<{ person: PersonRef | null }>>(`/volunteers${query}`)
          : Promise.resolve(undefined),
      ]);
      const asParticipant = participants?.items[0]?.person;
      const asVolunteer = volunteers?.items[0]?.person;
      const person = asParticipant ?? asVolunteer;
      if (!person) return null;
      return {
        id: person.id,
        label: fullName(person),
        sublabel: asParticipant ? 'Participant' : 'Volunteer',
      };
    },
  );

  return {
    value: rehydrated.value
      ? {
          personId: rehydrated.value.id,
          name: rehydrated.value.label,
          source: rehydrated.value.sublabel ?? '',
        }
      : null,
    status: rehydrated.status,
    onRetry: rehydrated.onRetry,
  };
}

export function PersonSearch({
  selected,
  status,
  onRetry,
  onSelect,
  placeholder,
  id,
}: {
  selected: PersonHit | null;
  /** Set by `usePersonOption` when the value came from the URL. */
  status?: RehydrationStatus;
  onRetry?: () => void;
  onSelect: (hit: PersonHit | null) => void;
  placeholder?: string;
  /** Forwarded to the inner control so a FormField label can target it. */
  id?: string;
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
      id={id}
      status={status}
      onRetry={onRetry}
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
      chapterScoped
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
