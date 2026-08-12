import {
  EntityPicker,
  useRehydratedValue,
  useRememberOption,
  type PickerOption,
  type RehydratedValue,
  type RehydrationStatus,
} from '@/components/ui/entity-picker';
import { api, qs, type Paged } from '@/lib/api';

/**
 * The cache namespace an id resolves under. Shared by the control and its
 * rehydration hook on purpose: the control writes what the user picked here and
 * the hook reads it back, so a mismatch would not fail — it would just quietly
 * refetch a label the app already had.
 *
 * Not the same as the SEARCH namespace below, which varies with the search's own
 * options (`volunteer-picker-true` for mentors only). An id means the same
 * record however the picker that produced it was configured.
 */
const PARTICIPANT = 'participant';
const VOLUNTEER = 'volunteer';

interface ParticipantHit {
  id: string;
  participantNumber: string;
  person: { firstName: string; lastName: string };
}

interface VolunteerHit {
  id: string;
  status: string;
  person: { firstName: string; lastName: string };
}

/**
 * The props every picker shares. `status`/`onRetry` are what a URL-backed filter
 * spreads in from its rehydration hook; a form leaves them off.
 */
interface PickerProps {
  value: PickerOption | null;
  status?: RehydrationStatus;
  onRetry?: () => void;
  onChange: (option: PickerOption | null) => void;
  disabled?: boolean;
  /** Forwarded to the inner control so a FormField label can target it. */
  id?: string;
}

/**
 * One mapper per entity, shared by the typeahead and the rehydration lookup.
 *
 * Not a convenience: a filter chip that spelled a name differently from the
 * search result the user picked would read as a different record.
 */
const participantOption = (p: ParticipantHit): PickerOption => ({
  id: p.id,
  label: `${p.person.firstName} ${p.person.lastName}`,
  sublabel: p.participantNumber,
});

const volunteerOption = (v: VolunteerHit): PickerOption => ({
  id: v.id,
  label: `${v.person.firstName} ${v.person.lastName}`,
});

/**
 * Resolve one id through the LIST endpoint the picker already searches.
 *
 * `?id=<uuid>` runs the list's own where clause, chapter clause and all, so an
 * id the viewer may not see arrives as an empty page — never a 404 that would
 * confirm the record exists, and never a thrown error, which this control reads
 * as a failure of the request rather than a statement about access.
 */
async function firstMatch<T>(path: string, id: string, toOption: (row: T) => PickerOption) {
  const page = await api.get<Paged<T>>(`${path}${qs({ id, pageSize: 1 })}`);
  const row = page.items[0];
  return row ? toOption(row) : null;
}

/** Search-and-pick a participant profile. Replaces the four module-local copies. */
export function ParticipantPicker({ value, status, onRetry, onChange, disabled, id }: PickerProps) {
  const remember = useRememberOption(PARTICIPANT);
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
      disabled={disabled}
      queryKey="participant-picker"
      placeholder="Search participants by name or number…"
      search={async (term) => {
        const page = await api.get<Paged<ParticipantHit>>(
          `/participants${qs({ search: term, pageSize: 8 })}`,
        );
        return page.items.map(participantOption);
      }}
    />
  );
}

/** The name behind a `?participantId=` in the URL. Spread into ParticipantPicker. */
export function useParticipantOption(id: string): RehydratedValue {
  return useRehydratedValue(PARTICIPANT, id, (participantId) =>
    firstMatch('/participants', participantId, participantOption),
  );
}

/**
 * Search-and-pick a volunteer profile. mentorsOnly limits results to
 * screening-approved mentors (?isMentor=true) for match proposals.
 */
export function VolunteerPicker({
  value,
  status,
  onRetry,
  onChange,
  mentorsOnly = false,
  disabled,
  id,
}: PickerProps & { mentorsOnly?: boolean }) {
  const remember = useRememberOption(VOLUNTEER);
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
      disabled={disabled}
      queryKey={`volunteer-picker-${mentorsOnly}`}
      placeholder="Search volunteers by name…"
      search={async (term) => {
        const page = await api.get<Paged<VolunteerHit>>(
          `/volunteers${qs({ search: term, pageSize: 8, isMentor: mentorsOnly || undefined })}`,
        );
        return page.items.map(volunteerOption);
      }}
    />
  );
}

/** The name behind a `?volunteerId=` in the URL. Spread into VolunteerPicker. */
export function useVolunteerOption(id: string): RehydratedValue {
  return useRehydratedValue(VOLUNTEER, id, (volunteerId) =>
    firstMatch('/volunteers', volunteerId, volunteerOption),
  );
}

export type { PickerOption, RehydratedValue, RehydrationStatus };
