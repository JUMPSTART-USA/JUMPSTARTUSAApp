import { EntityPicker, type PickerOption } from '@/components/ui/entity-picker';
import { api, qs, type Paged } from '@/lib/api';

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

/** Search-and-pick a participant profile. Replaces the four module-local copies. */
export function ParticipantPicker({
  value,
  onChange,
  disabled,
}: {
  value: PickerOption | null;
  onChange: (option: PickerOption | null) => void;
  disabled?: boolean;
}) {
  return (
    <EntityPicker
      value={value}
      onChange={onChange}
      disabled={disabled}
      queryKey="participant-picker"
      placeholder="Search participants by name or number…"
      search={async (term) => {
        const page = await api.get<Paged<ParticipantHit>>(
          `/participants${qs({ search: term, pageSize: 8 })}`,
        );
        return page.items.map((p) => ({
          id: p.id,
          label: `${p.person.firstName} ${p.person.lastName}`,
          sublabel: p.participantNumber,
        }));
      }}
    />
  );
}

/**
 * Search-and-pick a volunteer profile. mentorsOnly limits results to
 * screening-approved mentors (?isMentor=true) for match proposals.
 */
export function VolunteerPicker({
  value,
  onChange,
  mentorsOnly = false,
  disabled,
}: {
  value: PickerOption | null;
  onChange: (option: PickerOption | null) => void;
  mentorsOnly?: boolean;
  disabled?: boolean;
}) {
  return (
    <EntityPicker
      value={value}
      onChange={onChange}
      disabled={disabled}
      queryKey={`volunteer-picker-${mentorsOnly}`}
      placeholder="Search volunteers by name…"
      search={async (term) => {
        const page = await api.get<Paged<VolunteerHit>>(
          `/volunteers${qs({ search: term, pageSize: 8, isMentor: mentorsOnly || undefined })}`,
        );
        return page.items.map((v) => ({
          id: v.id,
          label: `${v.person.firstName} ${v.person.lastName}`,
        }));
      }}
    />
  );
}

export type { PickerOption };
