import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/filter-select';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Paged } from '@/lib/api';
import { useChapterScope } from '@/lib/chapter-scope';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';

/**
 * Server-driven data table: every list screen uses server-side sorting,
 * filtering and pagination (§3.1). Columns declare their server sort key;
 * the parent owns the query state and refetches.
 */
export interface Column<T> {
  key: string;
  header: string;
  sortKey?: string;
  render: (row: T) => ReactNode;
  className?: string;
  /**
   * How this column behaves below `sm`, where a table that opted into `cards`
   * renders rows as cards.
   *
   *   'identity'  the title line. Defaults to the column `rowHref` links
   *               (linkColumnKey when the table names one), which #84 already
   *               identified as the row's identity.
   *   'status'    pulled out to the top-right, where a state reads without
   *               hunting — 28 of 33 tables bury a badge mid-row.
   *   'field'     a labelled field. A table header does this work once for 25
   *               rows; a card repeats the label on every one, which is the
   *               honest cost of the format and why only a few fit.
   *   'meta'      folded under the identity line (a number, a chapter).
   *   'hidden'    dropped on a phone. The row is still tappable and the full
   *               record is one tap away.
   *
   * Unhinted columns get safe defaults (see cardPlan): the linked column is
   * the identity, a column keyed 'actions' becomes the card footer, the next
   * two columns are fields, the rest are hidden — column order already
   * reflects importance, because that is how the tables were written.
   */
  card?: 'identity' | 'status' | 'field' | 'meta' | 'hidden';
}

export interface ListState {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}

/**
 * How a state change should land in history, for the stores that HAVE a history
 * — i.e. `useListParams`, which keeps list state in the URL.
 *
 * Optional, and second, so that the thirty-odd lists still holding their state
 * in `useState` keep working untouched: their `onStateChange` is a bare setter
 * that takes one argument and ignores anything after it.
 */
export interface ListStateChangeOptions {
  /**
   * Replace the current history entry instead of pushing a new one. For changes
   * the USER did not make, so Back does not walk them through corrections.
   */
  replace?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: Paged<T> | undefined;
  isLoading: boolean;
  state: ListState;
  onStateChange: (next: ListState, options?: ListStateChangeOptions) => void;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  /**
   * An empty list is a fork in the road, and until now every one of the 52
   * tables took the same turn: a centred sentence and nothing to do about it.
   *
   * Pass `isFiltered` (useListParams computes it already) and the table can tell
   * the two cases apart — nothing exists yet, versus a filter excluded
   * everything — and offer the matching way out. `onClearFilters` is
   * `useListParams`'s `clear`, which has been sitting there unused.
   */
  isFiltered?: boolean;
  onClearFilters?: () => void;
  /** Offered when the list is empty and NOT filtered: usually "New <thing>". */
  emptyAction?: ReactNode;
  /**
   * Set on tables whose list endpoint is FORCE-FILTERED to the session's
   * chapter for scoped users. The empty state then adds "Showing the
   * {Chapter} chapter only." under both fork branches — because for a scoped
   * user, "No donors found" is false for the org and "Every record is excluded
   * by a filter above" blames controls that are not even rendered. The line
   * states WHERE the view looked, never why it is empty, and is built from the
   * session alone, so it cannot become a §7.2 oracle (lib/chapter-scope.ts).
   *
   * OPT-IN, not a default, because the flag is a claim about the API: a
   * blanket default is provably wrong for org-global lists (support tickets),
   * chapter-neutral ones (case tasks include parentless staff to-dos from any
   * chapter — TasksPage must NOT set this), and parent-scoped child tables.
   * Set it only where the endpoint filters on the session's chapter.
   */
  chapterScoped?: boolean;
  /**
   * Render rows as CARDS below `sm` instead of a sideways-scrolling table.
   *
   * OPT-IN, one list at a time — the design sketch's own verdict. Cards are
   * better for "look one record up and open it" and worse for "scan a column
   * for the outlier": a card is ~2.5x a row's height and nothing lines up
   * across rows. Whether a list's phone traffic is lookup or scanning is a
   * fact about how staff work, not about the code, so each table decides.
   * The client-error reports carry viewports now; let them argue for the rest.
   */
  cards?: boolean;
  /**
   * Where a row leads. Prefer this over `onRowClick` for any list whose rows
   * open a record: it renders the row's identifying cell as a real <Link>, so a
   * keyboard or screen-reader user gets one tab stop per row with the record's
   * name as the link text — and clicking anywhere in the row still works.
   *
   * `onRowClick` alone leaves rows reachable by pointer only. There was nothing
   * focusable inside them, so keyboard users could not open a participant, a
   * donor, a home or an event from any list at all.
   */
  rowHref?: (row: T) => string;
  /**
   * The dialog-opening counterpart of `rowHref`, for lists whose rows open a
   * panel rather than navigate. Renders the identifying cell as a button, so the
   * accessible name is the row's own text — no per-page label to write and
   * nothing to drift. Pass `undefined` (e.g. from a permission check) and no
   * button renders.
   */
  onRowOpen?: (row: T) => void;
  /** Accessible name for the row link/button, when the cell's text is not identifying. */
  rowLabel?: (row: T) => string;
  /** Column carrying the row link. Defaults to the first — override when that one is a date. */
  linkColumnKey?: string;
  /**
   * True while a refetch for NEW list state is in flight and `data` still holds
   * the previous page — i.e. the rows on screen are stale but readable. Pass a
   * query's `isFetching` alongside `placeholderData: keepPreviousData`. Omitting
   * it means this table never reports staleness; nothing is inferred.
   *
   * Without it, changing page threw the rows away: ~1,200px of table collapsed to
   * a 128px spinner and back, a ~1,000px layout shift each way that also discarded
   * the user's scroll position, while the footer briefly reported the wrong page
   * count. Keeping the previous page on screen removes all of that.
   */
  isFetching?: boolean;
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  isLoading,
  state,
  onStateChange,
  onRowClick,
  emptyMessage = 'No records found',
  isFiltered,
  onClearFilters,
  emptyAction,
  rowHref,
  onRowOpen,
  rowLabel,
  linkColumnKey,
  isFetching,
  chapterScoped,
  cards,
}: DataTableProps<T>) {
  const navigate = useNavigate();
  // Called unconditionally (hooks rule); only consulted when `cards` is set.
  const isPhone = useMediaQuery('(max-width: 639px)');
  const useCards = Boolean(cards && isPhone);
  const { name: chapterName } = useChapterScope();
  const totalPages = data ? Math.max(1, Math.ceil(data.total / state.pageSize)) : 1;
  const linkKey = linkColumnKey ?? columns[0]?.key;
  /**
   * Whether the table is scrolled off its left edge, which is the only moment
   * the pinned column needs to look pinned. Same approach as the pill bars'
   * edge fade: a shadow that appears when there is something underneath it.
   */
  const [scrolled, setScrolled] = useState(false);

  /**
   * Keep the row's IDENTITY on screen while the rest scrolls.
   *
   * Measured on /participants at 375px: the table is 854px wide in a 341px
   * window, so reading a status means scrolling 513px right — at which point the
   * name cell sits at left: -496px, entirely off screen. You are looking at a
   * status with no idea whose it is.
   *
   * It pins the IDENTIFYING column rather than the first one, because eight
   * tables lead with a date and pinning "Aug 6, 2026" anchors nothing. That
   * column is already known: it is the cell `rowHref` turns into a link, which
   * callers can name with `linkColumnKey`. Plain `sticky left-0` handles a
   * non-first column too — earlier columns scroll underneath it, which is
   * exactly what should happen to a date once you have left it behind.
   */
  const pinnedClasses = (key: string) =>
    key === linkKey
      ? cn('sticky left-0 z-10 bg-inherit', scrolled && 'shadow-[1px_0_0_0_hsl(var(--border))]')
      : undefined;

  /**
   * Rows are on screen but no longer current. Driven ONLY by the caller's
   * `isFetching` — deliberately no inference.
   *
   * This used to fall back to `data.page !== state.page` when no `isFetching` was
   * passed, on the theory that it protected lists not yet migrated. It protected
   * nothing: an unmigrated list has no placeholderData, so on a page change its
   * data goes undefined, `isLoading` is true, and the expression short-circuits
   * before ever reaching the comparison. No code path in the app reached it.
   *
   * And it could brick a screen. `stale` disables BOTH pagers, so if a list ever
   * changed `state.page` without changing its query key — which is exactly what a
   * migration to useListParams does if it forgets to pass the page through to the
   * request — no refetch happens, `data.page` stays behind `state.page`, and the
   * comparison latches true forever: a permanently dimmed table whose only escape
   * controls are disabled. A forgotten `isFetching` now costs a missing dim
   * instead of a dead screen.
   */
  const stale = !isLoading && !!data && isFetching === true;

  /**
   * Land on the last real page when the requested one is past the end.
   *
   * Page numbers live in the URL now (`useListParams`), so a shared or
   * bookmarked link can point at a page its result set no longer has:
   * /intake?apps.page=2 on the four-record application queue rendered "Page 2
   * of 1" over an empty table. Prev got you out, so it was never a dead end —
   * but it is a page nobody asked for, and the fix belongs here rather than in
   * each of the fifty lists.
   *
   * Three conditions, each load-bearing:
   *
   * SETTLED ONLY. `totalPages` is derived from whatever `data` holds right now,
   * and mid-request that is the PREVIOUS query's total — the same reason both
   * pagers go dead while `stale`. Judging against it would snap on a count that
   * is about to change and fight the request already in flight. `isLoading`
   * covers the first load, when there is no total at all; `stale` covers a
   * refetch that is keeping the previous page on screen.
   *
   * ONE ATTEMPT PER PAGE. The ref is what makes this a correction rather than a
   * loop. Normally it converges on its own — the target is `totalPages`, always
   * strictly below a page that is past the end, so even a result set shrinking
   * under us walks down and stops. The ref is for the case where nothing moves:
   * a parent that drops the change, or a server that keeps echoing a total the
   * requested page is past. Cleared as soon as the page is in range again, so a
   * page that becomes real later is not permanently unreachable.
   *
   * REPLACE, NOT PUSH. `onListStateChange` pushes for a page change, because
   * paging is the one movement a user expects Back to undo. This is not that
   * movement — the user never asked for it, and pushing would make Back return
   * them to the page that does not exist.
   */
  const snappedFrom = useRef<number | null>(null);
  /** Neither is a dependency: a list may pass a fresh object or arrow each render. */
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (isLoading || !data || stale) return;
    if (state.page <= totalPages) {
      snappedFrom.current = null;
      return;
    }
    if (snappedFrom.current === state.page) return;
    snappedFrom.current = state.page;
    onStateChangeRef.current({ ...stateRef.current, page: totalPages }, { replace: true });
  }, [isLoading, data, stale, state.page, totalPages]);

  /**
   * Row-level pointer navigation, so `rowHref` fully replaces `onRowClick`
   * without taking away click-anywhere. Deliberately ignores modified clicks and
   * clicks that started on a link or button, so cmd-click still opens a new tab
   * and a row's own action buttons are not hijacked.
   */
  const onRowPointer = (row: T) => (e: MouseEvent<HTMLTableRowElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('a,button,input,select,textarea,[role="button"]')) return;
    navigate(rowHref!(row));
  };

  const toggleSort = (sortKey: string) => {
    if (state.sortBy === sortKey) {
      onStateChange({ ...state, sortDir: state.sortDir === 'asc' ? 'desc' : 'asc', page: 1 });
    } else {
      onStateChange({ ...state, sortBy: sortKey, sortDir: 'asc', page: 1 });
    }
  };

  /**
   * The card plan, from hints with safe defaults: the linked column is the
   * identity, 'actions' is the footer, explicit hints win, and with no field
   * hints the next two columns become the fields — column order already
   * reflects importance, because that is how the tables were written. The
   * rest are hidden; the record is one tap away.
   */
  const identityCol =
    columns.find((c) => c.card === 'identity') ?? columns.find((c) => c.key === linkKey) ?? columns[0];
  // The identity is excluded from every other slot: a linked column hinted
  // 'status' or 'meta' would otherwise render twice per card.
  const statusCol = columns.find((c) => c.card === 'status' && c !== identityCol);
  const actionsCol = columns.find((c) => c.key === 'actions' && c.card !== 'hidden');
  const metaCols = columns.filter((c) => c.card === 'meta' && c !== identityCol);
  const explicitFields = columns.filter((c) => c.card === 'field' && c !== identityCol);
  const fieldCols =
    explicitFields.length > 0
      ? explicitFields
      : columns
          .filter(
            (c) =>
              c !== identityCol &&
              c !== statusCol &&
              c !== actionsCol &&
              c.card !== 'meta' &&
              c.card !== 'hidden',
          )
          .slice(0, 2);
  const sortableCols = columns.filter((c) => c.sortKey);
  const activeSortCol = sortableCols.find((c) => c.sortKey === state.sortBy);

  /**
   * The identifying cell as the row's one tab stop — same rule both modes.
   *
   * `asIdentity` is card mode saying "this IS the identity slot": without it,
   * a table that hints `card: 'identity'` onto a column other than the linked
   * one would render cards with ZERO tab stops — pointer-only rows, the exact
   * failure Phase 2 closed — while its own desktop table kept the link.
   */
  const identityCell = (row: T, col: Column<T>, asIdentity = false) =>
    rowHref && (asIdentity || col.key === linkKey) ? (
      <Link
        to={rowHref(row)}
        aria-label={rowLabel?.(row)}
        className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {col.render(row)}
      </Link>
    ) : onRowOpen && (asIdentity || col.key === linkKey) ? (
      <button
        type="button"
        aria-label={rowLabel?.(row)}
        onClick={(e) => {
          e.stopPropagation();
          onRowOpen(row);
        }}
        className="rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {col.render(row)}
      </button>
    ) : (
      col.render(row)
    );

  const rowPointer = (row: T) =>
    rowHref
      ? onRowPointer(row)
      : onRowOpen
        ? () => onRowOpen(row)
        : onRowClick
          ? () => onRowClick(row)
          : undefined;

  /** One empty-state body for both modes, so the fork and the chapter scope
      line cannot drift between the table and its card rendering. */
  const emptyContent = (
    <div className="flex flex-col items-center gap-1">
      <p className="text-sm font-medium">
        {isFiltered ? 'No matches for these filters' : emptyMessage}
      </p>
      {isFiltered ? (
        <p className="text-sm text-muted-foreground">
          Every record is excluded by a filter above.
        </p>
      ) : null}
      {/* Only on a RESOLVED empty result (`data` present): with the
          query still failed-or-unresolved, seven CRM pages stack an
          ErrorState above an unconditional DataTable, and a scope
          line under "No donors found" would dress an error up as a
          confirmed empty chapter. */}
      {chapterScoped && chapterName && data ? (
        <p className="text-sm text-muted-foreground">
          Showing the {chapterName} chapter only.
        </p>
      ) : null}
      {isFiltered && onClearFilters ? (
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onClearFilters}>
          Clear filters
        </Button>
      ) : !isFiltered && emptyAction ? (
        <div className="mt-3">{emptyAction}</div>
      ) : null}
    </div>
  );

  const footer = (
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      {/* A spinner here, not only the dim: opacity is a contrast-only signal, and
          at the 90% the AA floor allows it is too quiet to be the whole cue. */}
      <span className="flex items-center gap-2">
        {stale ? <Spinner className="h-3.5 w-3.5" /> : null}
        {data ? `${data.total} record${data.total === 1 ? '' : 's'}` : ''}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={stale || state.page <= 1}
          aria-label="Previous page"
          onClick={() => onStateChange({ ...state, page: state.page - 1 })}
        >
          <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Prev</span>
        </Button>
        <span className="whitespace-nowrap">
          Page {state.page} of {totalPages}
        </span>
        {/**
         * Both pagers are disabled while stale, because `totalPages` is derived
         * from the PREVIOUS result set's total. After a filter change that
         * narrows the results, Next would otherwise stay enabled into a page the
         * new set does not have. (Until now the blanking hid this: data went
         * undefined, totalPages collapsed to 1, and Next disabled itself by
         * accident.)
         */}
        <Button
          variant="outline"
          size="sm"
          disabled={stale || state.page >= totalPages}
          aria-label="Next page"
          onClick={() => onStateChange({ ...state, page: state.page + 1 })}
        >
          <span className="hidden sm:inline">Next</span> <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  if (useCards) {
    return (
      <div className="space-y-3" aria-busy={isLoading || stale}>
        {/* Sort lived in the column headers, and cards have none — so it moves
            into a control that drives the same URL-backed list state. Same
            semantics as toggleSort: any change resets to page 1. */}
        {sortableCols.length > 0 ? (
          <div className="flex items-center gap-2">
            {/* The placeholder renders whenever the URL's sort matches NO
                sortable column, not just when it is absent — a select whose
                value matches no option displays the FIRST option as if it
                were chosen (the exact failure filter-select.tsx documents),
                which here would claim the list is sorted by a column it is
                not. The aria-label carries the current choice so a screen
                reader hears what the sort IS, not just "Sort by" — the state
                aria-sort used to announce from the vanished headers. */}
            <FilterSelect
              aria-label={activeSortCol ? `Sort by: ${activeSortCol.header}` : 'Sort by'}
              className="w-full"
              value={activeSortCol ? (state.sortBy ?? '') : ''}
              onChange={(value) => {
                if (value) onStateChange({ ...state, sortBy: value, page: 1 });
              }}
            >
              {!activeSortCol ? <option value="">Sort…</option> : null}
              {sortableCols.map((c) => (
                <option key={c.sortKey} value={c.sortKey}>
                  {c.header}
                </option>
              ))}
            </FilterSelect>
            {/* No direction toggle without an active sort: it would announce
                "Sorted ascending" over an unsorted list and push a history
                entry for a visible no-op. */}
            {activeSortCol ? (
              <Button
                variant="outline"
                size="sm"
                aria-label={
                  state.sortDir === 'asc'
                    ? 'Sorted ascending — switch to descending'
                    : 'Sorted descending — switch to ascending'
                }
                onClick={() =>
                  onStateChange({ ...state, sortDir: state.sortDir === 'asc' ? 'desc' : 'asc', page: 1 })
                }
              >
                {state.sortDir === 'asc' ? (
                  <ArrowUp className="h-4 w-4" />
                ) : (
                  <ArrowDown className="h-4 w-4" />
                )}
              </Button>
            ) : null}
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex h-32 items-center justify-center rounded-md border bg-card">
            <Spinner />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="rounded-md border bg-card py-10 text-center">{emptyContent}</div>
        ) : (
          /* role="list" is not redundant: Tailwind preflight sets list-style
             none, and WebKit's heuristic then strips list semantics — so iOS
             VoiceOver, the entire audience of a below-sm mode, would hear
             neither "list" nor the item count. */
          <ul role="list" className={cn('space-y-2 transition-opacity', stale && 'opacity-90')}>
            {data.items.map((row) => (
              <li key={row.id}>
                <article
                  className={cn(
                    'grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-md border bg-card p-3',
                    rowPointer(row) && 'cursor-pointer',
                  )}
                  onClick={rowPointer(row)}
                >
                  <div className="min-w-0 text-sm font-medium">
                    {identityCol ? identityCell(row, identityCol, true) : null}
                    {metaCols.length > 0 ? (
                      <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs font-normal text-muted-foreground">
                        {metaCols.map((c) => (
                          <span key={c.key}>
                            <span className="sr-only">{c.header}: </span>
                            {c.render(row)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {statusCol ? (
                    <div className="justify-self-end">
                      {/* The table header labelled this cell; the card must
                          too, or "Active" answers a question nobody heard. */}
                      <span className="sr-only">{statusCol.header}: </span>
                      {statusCol.render(row)}
                    </div>
                  ) : null}
                  {fieldCols.length > 0 ? (
                    <dl className="col-span-full mt-1 grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-x-4 gap-y-1">
                      {fieldCols.map((c) => (
                        <div key={c.key} className="min-w-0">
                          {/* The label a table header carries once per 25 rows,
                              repeated per card — the honest cost of the format. */}
                          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            {c.header}
                          </dt>
                          <dd className="m-0 text-sm">{c.render(row)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {actionsCol ? (
                    <div className="col-span-full mt-2 border-t pt-2">{actionsCol.render(row)}</div>
                  ) : null}
                </article>
              </li>
            ))}
          </ul>
        )}

        {footer}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* aria-busy is the only loading signal this table has ever had for
          assistive tech — the bare <Spinner> below carries no role="status". */}
      <Table aria-busy={isLoading || stale} onScrolledChange={setScrolled}>
        <TableHeader>
          <TableRow>
            {columns.map((col) => {
              const sorted = col.sortKey && state.sortBy === col.sortKey;
              return (
                <TableHead
                  key={col.key}
                  className={cn(col.className, pinnedClasses(col.key))}
                  /* Without aria-sort a screen-reader user is told a column is
                     sortable but never which column is sorted, or which way. */
                  aria-sort={
                    !col.sortKey
                      ? undefined
                      : sorted
                        ? state.sortDir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                  }
                >
                  {col.sortKey ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => toggleSort(col.sortKey!)}
                    >
                      {col.header}
                      {sorted ? (
                        state.sortDir === 'asc' ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : (
                        // Was opacity-40, which measured 1.79:1 — the affordance
                        // telling you a column can be sorted was near-invisible.
                        <ArrowUpDown className="h-3 w-3 opacity-70" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        {/**
         * Dimmed to 90%, NOT the 70% first proposed. Measured on these tokens:
         * --muted-foreground over --card is 6.11:1 at full opacity, 4.85:1 at 90%,
         * and 3.16:1 at 70% — below the 4.5:1 AA floor for body text. This repo
         * just raised --input (1.68:1) and --ring (2.32:1) to clear exactly that
         * threshold, so a transient sub-AA state would be undoing that work a few
         * weeks later. Row text itself (--foreground) has room to spare (7.05:1 at
         * 70%); it is the secondary/muted cells and the footer that fail, and they
         * are the ones a user squints at. The footer spinner below carries the
         * signal that the 10% cannot.
         */}
        <TableBody className={cn('transition-opacity', stale && 'opacity-90')}>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-32 text-center">
                <Spinner className="mx-auto" />
              </TableCell>
            </TableRow>
          ) : !data || data.items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-10 text-center">
                {emptyContent}
              </TableCell>
            </TableRow>
          ) : (
            data.items.map((row) => (
              <TableRow
                key={row.id}
                className={onRowClick || rowHref || onRowOpen ? 'cursor-pointer' : undefined}
                onClick={rowPointer(row)}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={cn(col.className, pinnedClasses(col.key))}>
                    {identityCell(row, col)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {footer}
    </div>
  );
}

export const initialListState: ListState = { page: 1, pageSize: 25, sortDir: 'asc' };
