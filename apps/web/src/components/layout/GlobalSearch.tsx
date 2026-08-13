import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchInput } from '@/components/ui/toolbar';
import { Button } from '@/components/ui/button';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useChapterScope } from '@/lib/chapter-scope';
import { useDebounced } from '@/lib/form';
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
  const { name: chapterName } = useChapterScope();
  const boxRef = useRef<HTMLDivElement>(null);

  /**
   * Debounced like every other search box in the app (35 files use this helper).
   * This one queried on the raw value, so the highest-traffic field in the
   * product fired a request per keystroke — "Casteel" was seven.
   */
  const debouncedTerm = useDebounced(term);
  const enabled = can('participants.read') && debouncedTerm.trim().length >= 2;
  const { data, isError, refetch } = useQuery({
    queryKey: ['global-search', debouncedTerm],
    queryFn: () =>
      api.get<Paged<ParticipantHit>>(`/participants${qs({ search: debouncedTerm, pageSize: 8 })}`),
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
      <SearchInput
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Scoped sessions get the slice named up front, so a miss is read as
        // "none in my chapter", not "none anywhere" — the audit's headline
        // confusion. Session-derived, so identical whoever exists elsewhere.
        placeholder={
          chapterName
            ? `Search ${chapterName} participants by name, number, phone…`
            : 'Search participants by name, number, phone…'
        }
        aria-label="Search participants"
        className="sm:w-full"
      />
      {/* Three visible states. This used to render the dropdown only when
          items existed, so zero results and a FAILED request were both
          silence — indistinguishable from a typo, and the same failed-search-
          as-negative-result trap the entity picker documents. */}
      {open && enabled && isError ? (
        <div className="absolute top-11 z-50 flex w-full items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm shadow-card">
          <span className="text-destructive">Search failed</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : open && enabled && data && data.items.length === 0 ? (
        <div className="absolute top-11 z-50 w-full rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground shadow-card">
          {chapterName
            ? `No participants match in the ${chapterName} chapter.`
            : 'No participants match.'}
        </div>
      ) : null}
      {open && enabled && data && data.items.length > 0 ? (
        <div className="absolute top-11 z-50 w-full overflow-hidden rounded-md border bg-card shadow-card">
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
