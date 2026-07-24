import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, qs, type Paged } from '@/lib/api';

export interface PickerSelection {
  id: string;
  label: string;
}

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

function useDebounced(value: string, ms = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function SelectedRow({
  selection,
  onClear,
}: {
  selection: PickerSelection;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
      <span>{selection.label}</span>
      <Button variant="ghost" size="sm" onClick={onClear}>
        Change
      </Button>
    </div>
  );
}

function ResultList({
  isFetching,
  empty,
  children,
}: {
  isFetching: boolean;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="max-h-44 divide-y overflow-y-auto rounded-md border bg-card">
      {isFetching ? (
        <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>
      ) : empty ? (
        <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>
      ) : (
        children
      )}
    </div>
  );
}

/** Search-and-pick a participant; calls onSelect with the profile id. */
export function ParticipantPicker({
  selection,
  onSelect,
}: {
  selection: PickerSelection | null;
  onSelect: (sel: PickerSelection | null) => void;
}) {
  const [q, setQ] = useState('');
  const search = useDebounced(q);
  const { data, isFetching } = useQuery({
    queryKey: ['mentoring', 'participant-picker', search],
    queryFn: () =>
      api.get<Paged<ParticipantHit>>(`/participants${qs({ search, pageSize: 8 })}`),
    enabled: !selection && search.trim().length >= 2,
  });

  if (selection) return <SelectedRow selection={selection} onClear={() => onSelect(null)} />;

  return (
    <div className="space-y-1.5">
      <Input
        placeholder="Search participants by name or number…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {search.trim().length >= 2 ? (
        <ResultList isFetching={isFetching} empty={!data || data.items.length === 0}>
          {data?.items.map((p) => (
            <button
              key={p.id}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() =>
                onSelect({
                  id: p.id,
                  label: `${p.person.firstName} ${p.person.lastName} · ${p.participantNumber}`,
                })
              }
            >
              {p.person.firstName} {p.person.lastName}{' '}
              <span className="text-muted-foreground">· {p.participantNumber}</span>
            </button>
          ))}
        </ResultList>
      ) : null}
    </div>
  );
}

/**
 * Search-and-pick a volunteer profile. mentorsOnly limits results to
 * screening-approved mentors (?isMentor=true) for match proposals.
 */
export function VolunteerPicker({
  selection,
  onSelect,
  mentorsOnly = false,
}: {
  selection: PickerSelection | null;
  onSelect: (sel: PickerSelection | null) => void;
  mentorsOnly?: boolean;
}) {
  const [q, setQ] = useState('');
  const search = useDebounced(q);
  const { data, isFetching } = useQuery({
    queryKey: ['mentoring', 'volunteer-picker', mentorsOnly, search],
    queryFn: () =>
      api.get<Paged<VolunteerHit>>(
        `/volunteers${qs({ search, pageSize: 8, isMentor: mentorsOnly ? 'true' : undefined })}`,
      ),
    enabled: !selection && search.trim().length >= 2,
  });

  if (selection) return <SelectedRow selection={selection} onClear={() => onSelect(null)} />;

  return (
    <div className="space-y-1.5">
      <Input
        placeholder={mentorsOnly ? 'Search approved mentors…' : 'Search volunteers…'}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {search.trim().length >= 2 ? (
        <ResultList isFetching={isFetching} empty={!data || data.items.length === 0}>
          {data?.items.map((v) => (
            <button
              key={v.id}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() =>
                onSelect({ id: v.id, label: `${v.person.firstName} ${v.person.lastName}` })
              }
            >
              {v.person.firstName} {v.person.lastName}
            </button>
          ))}
        </ResultList>
      ) : null}
    </div>
  );
}
