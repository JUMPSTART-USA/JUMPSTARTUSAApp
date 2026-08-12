import { useQuery } from '@tanstack/react-query';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import {
  EntityPicker,
  useRehydratedValue,
  useRememberOption,
  type PickerOption,
  type RehydratedValue,
  type RehydrationStatus,
} from '@/components/ui/entity-picker';
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

/** Compact label + value tile for giving-summary rows. */
export function StatTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{children}</p>
    </div>
  );
}

const LIFECYCLE_META: Record<DonorLifecycle, { label: string; variant: BadgeProps['variant'] }> = {
  prospective: { label: 'Prospective', variant: 'outline' },
  new: { label: 'New', variant: 'info' },
  active: { label: 'Active', variant: 'success' },
  lapsed: { label: 'Lapsed', variant: 'warning' },
  inactive: { label: 'Inactive', variant: 'outline' },
};

/** Computed giving-lifecycle badge (prospective/new/active/lapsed/inactive). */
export function LifecycleBadge({ lifecycle }: { lifecycle: DonorLifecycle | null | undefined }) {
  if (!lifecycle) return <span className="text-muted-foreground">—</span>;
  const meta = LIFECYCLE_META[lifecycle];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

/** All campaigns for select controls — small dataset, cached per session. */
/**
 * The label for an <option> standing in for a filter value the loaded option list
 * does not contain — or null when no stand-in is needed.
 *
 * Returns a LABEL, not an element, and the caller must render the <option>
 * itself as a DIRECT child of FilterSelect. That control reads its children with
 * `child.type === 'option'` (filter-select.tsx), so an <option> wrapped in a
 * component of your own is invisible to it: the menu silently omits the value and
 * the button falls back to the first option. Measured — the first version of this
 * was a component and the select still read "All campaigns".
 *
 * Why a stand-in is needed at all: these filters now come from the URL, and the
 * option lists behind them are both capped (pageSize: 200) and CHAPTER-SCOPED. A
 * scoped user opening an all-chapters colleague's link gets a campaign id the
 * options query will never return, and a select whose value matches no option
 * renders as its first — so the screen said "All campaigns" while showing one
 * campaign's donations. That is the "filtered list beside an empty box" the entity
 * pickers were kept out of the URL to avoid.
 *
 * ONE message for every cause — another chapter, deleted, past the cap. Naming the
 * cause would make the control an existence oracle for other chapters' records,
 * the §7.2 leak just closed on /budget-items. Clearing the filter instead is not an
 * option either: it would silently widen the results beyond what the link asked for.
 */
export function unresolvedOptionLabel(
  value: string,
  options: { id: string }[] | undefined,
  isLoading: boolean,
): string | null {
  if (!value) return null;
  if (options?.some((o) => o.id === value)) return null;
  return isLoading ? 'Loading…' : "A record you can't view";
}

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
export function PersonSearch({
  selected,
  onSelect,
  placeholder,
  id,
}: {
  selected: PersonHit | null;
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
