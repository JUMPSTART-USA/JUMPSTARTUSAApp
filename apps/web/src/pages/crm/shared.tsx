import { useQuery } from '@tanstack/react-query';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { EntityPicker, type PickerOption } from '@/components/ui/entity-picker';
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

/** Debounced donor search-and-pick — the standard donor control (§6.8). */
export function DonorPicker({
  value,
  onChange,
  placeholder,
  disabled,
  id,
}: {
  value: PickerOption | null;
  onChange: (option: PickerOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Forwarded to the inner control so a FormField label can target it. */
  id?: string;
}) {
  return (
    <EntityPicker
      id={id}
      value={value}
      onChange={onChange}
      queryKey="crm-donor-picker"
      placeholder={placeholder ?? 'Search donors…'}
      disabled={disabled}
      search={async (term) => {
        const page = await api.get<Paged<DonorListItem>>(
          `/donors${qs({ search: term, pageSize: 8 })}`,
        );
        return page.items.map((donor) => ({
          id: donor.id,
          label: donor.name,
          sublabel: donor.email ?? undefined,
        }));
      }}
    />
  );
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
