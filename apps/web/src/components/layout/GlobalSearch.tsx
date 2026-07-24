import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fullName } from '@/lib/utils';

interface ParticipantHit {
  id: string;
  participantNumber: string;
  person: { firstName: string; lastName: string; preferredName?: string | null };
}

/**
 * Global search (top bar). Phase 1 searches participants — the record staff
 * look up constantly; other entities have list-screen search.
 */
export function GlobalSearch() {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { can } = useAuth();
  const boxRef = useRef<HTMLDivElement>(null);

  const enabled = can('participants.read') && term.trim().length >= 2;
  const { data } = useQuery({
    queryKey: ['global-search', term],
    queryFn: () =>
      api.get<Paged<ParticipantHit>>(`/participants${qs({ search: term, pageSize: 8 })}`),
    enabled,
    staleTime: 10_000,
  });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (!can('participants.read')) return <div className="flex-1" />;

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search participants by name, number, phone…"
        className="h-9 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {open && enabled && data && data.items.length > 0 ? (
        <div className="absolute top-11 z-50 w-full rounded-md border bg-card shadow-md">
          {data.items.map((hit) => (
            <button
              key={hit.id}
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                setOpen(false);
                setTerm('');
                navigate(`/participants/${hit.id}`);
              }}
            >
              <span>{fullName(hit.person)}</span>
              <span className="text-xs text-muted-foreground">{hit.participantNumber}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
