import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebounced } from '@/lib/form';
import { useChapterScope } from '@/lib/chapter-scope';
import { cn } from '@/lib/utils';

export interface PickerOption {
  id: string;
  label: string;
  sublabel?: string;
}

/**
 * Where a value that arrived as a bare id has got to.
 *
 * `ready` covers both a normal picked option and "nothing selected" — every
 * picker inside a form is permanently ready, because a user who picks a value
 * hands over the label with it. Only a value restored from a URL passes through
 * the other three.
 */
export type RehydrationStatus = 'ready' | 'loading' | 'unresolvable' | 'failed';

/**
 * A value plus how it got here. `useRehydratedValue` returns exactly this shape
 * so a caller can spread it into a picker: `<ParticipantPicker {...participant}
 * onChange={…} />`.
 */
export interface RehydratedValue {
  value: PickerOption | null;
  status: RehydrationStatus;
  /** Present only while `status` is 'failed'. */
  onRetry?: () => void;
}

const valueKey = (entityKey: string, id: string) => ['entity-picker-value', entityKey, id];

/**
 * Remember the option a user just picked, under the id it will come back as.
 *
 * A URL-backed filter writes the id and then asks for the LABEL back through
 * `useRehydratedValue`. Without this, choosing a name off the results list makes
 * the chip flash "Loading…" for the name that was on screen a moment ago — and
 * if that lookup fails, "Couldn't load" for a record the user just selected.
 *
 * The picker holds the answer already; this hands it to the cache instead of
 * asking the server for it back.
 */
export function useRememberOption(entityKey: string) {
  const client = useQueryClient();
  return useCallback(
    (option: PickerOption | null) => {
      if (option) client.setQueryData(valueKey(entityKey, option.id), option);
    },
    [client, entityKey],
  );
}

/**
 * Turn an id from the URL back into a labelled option.
 *
 * This is what kept the participant/donor filters out of the URL: the URL can
 * only carry an id, and a filtered list beside an empty picker box reads as a
 * bug — the user sees three of four hundred records and no reason why.
 *
 * `resolve` must return null for "no such record for you", NOT throw. The three
 * pickers resolve through their LIST endpoint (`?id=<uuid>&pageSize=1`) rather
 * than `GET /x/:id` precisely so that another chapter's id is an empty page
 * instead of a 404 — which keeps a thrown error meaning what it says here, a
 * transport or server failure, and never a statement about access.
 *
 * That distinction is the whole reason `failed` is a separate status from
 * `unresolvable`. Reporting "A record you can't view" for a request that simply
 * did not complete is the same false negative Phase 1 took out of the search
 * results, where a failed lookup rendered as "No matches" and staff created
 * duplicate people because of it.
 */
export function useRehydratedValue(
  entityKey: string,
  id: string,
  resolve: (id: string) => Promise<PickerOption | null>,
): RehydratedValue {
  const query = useQuery({
    // A separate root key from the typeahead's: same entity, different question.
    // It is keyed on the ENTITY, not on the search's namespace, because an id
    // means the same record however the picker that produced it was configured.
    queryKey: valueKey(entityKey, id),
    queryFn: () => resolve(id),
    enabled: id !== '',
    // The name behind an id does not move during a session's worth of paging.
    staleTime: 5 * 60_000,
  });

  if (!id) return { value: null, status: 'ready' };
  if (query.isPending) return { value: null, status: 'loading' };
  if (query.isError) {
    return { value: null, status: 'failed', onRetry: () => void query.refetch() };
  }
  return query.data
    ? { value: query.data, status: 'ready' }
    : { value: null, status: 'unresolvable' };
}

/**
 * Generic search-and-pick control: debounced typeahead, result list, selected
 * chip with a clear button. ParticipantPicker / VolunteerPicker in
 * @/components/pickers wrap this with their endpoints.
 */
export function EntityPicker({
  value,
  status = 'ready',
  onRetry,
  onChange,
  queryKey,
  search,
  placeholder = 'Search…',
  minChars = 2,
  disabled,
  className,
  id,
  chapterScoped,
}: {
  value: PickerOption | null;
  /**
   * Only for a value restored from a URL — see `useRehydratedValue`. Anything
   * other than 'ready' renders the chip in place of the search box, so the
   * control never sits empty next to a list its own id is filtering.
   */
  status?: RehydrationStatus;
  /** Retry a failed rehydration. Ignored unless `status` is 'failed'. */
  onRetry?: () => void;
  onChange: (option: PickerOption | null) => void;
  /** Cache namespace, e.g. 'participant-picker'. */
  queryKey: string;
  search: (term: string) => Promise<PickerOption[]>;
  placeholder?: string;
  minChars?: number;
  disabled?: boolean;
  className?: string;
  /**
   * Lands on whichever control is showing so a FormField label's htmlFor
   * resolves: the search box while empty, the Change button once a value is
   * picked (both are labelable elements).
   */
  id?: string;
  /**
   * Set by pickers whose search endpoint is FORCE-FILTERED to the session's
   * chapter (participants, volunteers, donors). The zero-result row then names
   * the slice — "No matches in the South Carolina chapter" — because a bare
   * "No matches" is read as "this person is not in the system", which is the
   * duplicate-creation path documented at the failed-search branch below.
   * OPT-IN because the claim is about the ENDPOINT: MergePage's picker searches
   * org-wide, and the DonorProfilePage household picker searches the DONOR's
   * chapter; the session-derived suffix would be false on both.
   */
  chapterScoped?: boolean;
}) {
  const [q, setQ] = useState('');
  const { name: scopeName } = useChapterScope();
  const term = useDebounced(q.trim());
  const enabled = !value && term.length >= minChars;
  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ['entity-picker', queryKey, term],
    queryFn: () => search(term),
    enabled,
  });

  /**
   * A filter still resolving, or one that never will, holds the chip too. The
   * alternative — falling back to the search box — is the empty-box-beside-a-
   * filtered-list bug this control was taught to rehydrate to avoid.
   */
  if (value || status !== 'ready') {
    return (
      <div
        className={cn(
          'flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-sm',
          className,
        )}
      >
        <span className="min-w-0 truncate">
          {value ? (
            <>
              {value.label}
              {value.sublabel ? (
                <span className="text-muted-foreground"> · {value.sublabel}</span>
              ) : null}
            </>
          ) : status === 'loading' ? (
            <span className="text-muted-foreground">Loading…</span>
          ) : status === 'failed' ? (
            <span className="text-destructive">Couldn&apos;t load</span>
          ) : (
            /* ONE message for every cause — another chapter, deleted, since
               renamed. Naming the cause would make a filter chip an existence
               oracle for other chapters' records (§7.2), and the option-list
               stand-in on the CRM selects says the same thing for the same
               reason (crm/shared.tsx). Clearing the filter instead is not an
               option: it would silently widen the list past what the link asked
               for. */
            <span className="text-muted-foreground">A record you can&apos;t view</span>
          )}
        </span>
        {status === 'failed' && onRetry ? (
          <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
        {!disabled ? (
          <Button
            id={id}
            variant="ghost"
            size="sm"
            className="-mr-2 shrink-0"
            onClick={() => onChange(null)}
          >
            <X className="h-3.5 w-3.5" /> Change
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <Input
        id={id}
        placeholder={placeholder}
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
      />
      {enabled ? (
        <div className="max-h-44 divide-y overflow-y-auto rounded-md border bg-card shadow-card">
          {isFetching ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>
          ) : isError ? (
            /* A failed search must never render as a negative result. Reporting
               "No matches" when the request errored told staff a person was not
               in the system, so they created a second record for them — exactly
               the duplicate the create flow works to prevent. */
            <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="text-destructive">Search failed</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : !data || data.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {/* Coverage, never cause: identical whether the person exists in
                  another chapter or nowhere — the list endpoint already answers
                  both the same way (§7.2, pinned by pickers.test.tsx). */}
              {chapterScoped && scopeName ? `No matches in the ${scopeName} chapter` : 'No matches'}
            </div>
          ) : (
            data.map((option) => (
              <button
                key={option.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                onClick={() => onChange(option)}
              >
                {option.label}
                {option.sublabel ? (
                  <span className="text-muted-foreground"> · {option.sublabel}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
