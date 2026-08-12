import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import type { ListState, ListStateChangeOptions } from '@/components/DataTable';

/**
 * List view state — search, filters, sort, page — held in the URL instead of
 * useState.
 *
 * The audit's finding was that nothing a user builds up survives a navigation:
 * every list held its own state locally, so drilling into a record and coming
 * back lost the filters, and no list view could be linked to a colleague or
 * bookmarked. This replaces the STORAGE of ListState, not DataTable.
 *
 * Three router behaviours it has to work around, all measured rather than
 * assumed — see list-params.test.tsx, which pins each one:
 *
 * 1. `setSearchParams` is `navigate("?" + params, opts)` under the hood, so it
 *    navigates with NO location.state unless you pass it. Eighteen-odd
 *    `<BackLink stateOnly />` sites render nothing when `location.state.back` is
 *    absent, so a naive write makes the "← Dashboard" breadcrumb vanish the
 *    moment someone types in a search box. Every write here carries `loc.state`.
 *
 * 2. Its functional updater receives the SNAPSHOT from the render that created
 *    it, NOT the current params. With two lists on one route, one list's write
 *    does not necessarily re-render the sibling, so the sibling's next write is
 *    based on params from before — it resurrects the old query string and silently
 *    drops the first list's key.
 *
 *    Measured on /housing rather than reasoned about: after the Residents search
 *    committed (`?tab=residents&residents.search=Dar` in the address bar), the
 *    page-level tab hook's snapshot still read `tab=residents`, so clicking the
 *    Homes tab wrote `?tab=homes` and threw the search away. Instrumenting the
 *    write showed `prev` stale while `window.location.search` was correct.
 *
 *    So every write is based on `window.location.search`, which history.push
 *    updates synchronously. That is also why the tests mount the same DATA BROWSER
 *    ROUTER the app uses instead of MemoryRouter — under MemoryRouter the window
 *    URL never changes, so this class of bug is invisible and the tests would pass
 *    against the broken version. `patch()` remains for changes touching two keys,
 *    so the intent is one history entry rather than two.
 *
 * 3. Its identity changes whenever the query string changes, so it can never go
 *    in a dependency array. It is held in a ref.
 *
 * DIALOGS AND TYPEAHEADS STAY ON useState. A search box inside a dialog, or an
 * entity picker's lookup field, is not view state — putting it in the URL would
 * leave `?q=` behind after the dialog closed and make a shared link reopen
 * someone else's half-typed search.
 */

/**
 * One declared parameter: how it reads from and writes to the URL.
 *
 * `parse` and `serialize` are declared as METHODS, not as function-typed
 * properties, and that is deliberate. Under strictFunctionTypes a property of
 * type `(value: T) => string` is contravariant in T, so `ParamSpec<string>` would
 * not be assignable to the `ParamSpec<unknown>` that the hook's generic
 * constraint needs, and every caller would fail to typecheck. Method syntax is
 * compared bivariantly, which is what makes a heterogeneous spec map possible
 * without resorting to `any`.
 */
export interface ParamSpec<T> {
  /** The value when the key is ABSENT. Never written to the URL. */
  default: T;
  /**
   * A URL is user-editable input. Anything unrecognised must fall back to
   * `default` rather than reach the API — this is the only validation between a
   * hand-edited query string and a request.
   */
  parse(raw: string): T;
  serialize(value: T): string;
  /** Free text: writes coalesce for this long and are always `replace`. */
  debounceMs?: number;
  /** Whether changing this sends the list back to page 1. Default true. */
  resetsPage?: boolean;
}

const DEBOUNCE_MS = 300;

/** Matches the `uuid` shape every id param in this API uses. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const P = {
  /** Free text (a search box). Bind the input to `draft`, the query to `values`. */
  text: (def = '', debounceMs: number = DEBOUNCE_MS): ParamSpec<string> => ({
    default: def,
    parse: (raw) => raw,
    serialize: (value) => value,
    debounceMs,
  }),

  /**
   * A discrete filter drawn from a known set. `''` is a REAL value meaning
   * "explicitly cleared", distinct from absent, which means the default — the
   * distinction matters on the lists whose default status is 'pending', where a
   * user must be able to ask for all statuses.
   */
  choice: <const V extends readonly string[]>(
    values: V,
    def: V[number] | '' = '',
  ): ParamSpec<V[number] | ''> => ({
    default: def,
    parse: (raw) =>
      raw === '' || (values as readonly string[]).includes(raw) ? (raw as V[number] | '') : def,
    serialize: (value) => value,
  }),

  /**
   * An id from a fetched option list or a picker; the caller rehydrates the label.
   *
   * Validated as a UUID, because an identity parse here broke the promise the
   * doc above makes: `?campaignId=abc` reached the API and 400'd the WHOLE list
   * ("Validation failed (uuid is expected)"), so one bad character in a pasted
   * link took out the screen instead of degrading to no filter. There is no
   * closed set to check an id against, but there is a shape.
   */
  id: (): ParamSpec<string> => ({
    default: '',
    parse: (raw) => (UUID.test(raw) ? raw : ''),
    serialize: (value) => value,
  }),

  /** A date-only 'yyyy-MM-dd' bound. Anything else is discarded. */
  date: (): ParamSpec<string> => ({
    default: '',
    parse: (raw) => (/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : ''),
    serialize: (value) => value,
  }),

  flag: (def = false): ParamSpec<boolean> => ({
    default: def,
    parse: (raw) => raw === '1',
    serialize: (value) => (value ? '1' : '0'),
  }),

  /** A positive integer. Used for `page`, whose reset behaviour is inverted. */
  int: (def: number): ParamSpec<number> => ({
    default: def,
    parse: (raw) => {
      const n = Number.parseInt(raw, 10);
      return Number.isInteger(n) && n > 0 ? n : def;
    },
    serialize: String,
  }),
};

export interface ListParamsOptions {
  /**
   * Prefix for every key this instance owns, REQUIRED when a route can mount two
   * lists: `ns: 'trn'` gives `?trn.page=2`. Without it the three request tables
   * on one screen share `?page=`, and paging one silently pages the others —
   * the only place in this migration where a missing namespace is a data bug
   * rather than a cosmetic one.
   */
  ns?: string;
  /** Initial sort, matching the list's server-side default. */
  sort?: { by?: string; dir?: 'asc' | 'desc' };
  /** Rows per page. Never a URL key — no screen offers a rows-per-page control. */
  pageSize?: number;
}

type Values<S> = { [K in keyof S]: S[K] extends ParamSpec<infer T> ? T : never };

export interface ListParams<S extends Record<string, ParamSpec<unknown>>> {
  /** Committed values. These belong in the queryKey and in the request. */
  values: Values<S>;
  /** Live values, including text not yet committed. Bind CONTROLS to these. */
  draft: Values<S>;
  set<K extends keyof S>(key: K, value: Values<S>[K]): void;
  /** Several keys in ONE write. Required whenever a change touches two params. */
  patch(next: Partial<Values<S>>): void;
  /** Drop every declared param (and the page), leaving the rest of the URL alone. */
  clear(): void;
  /** Any declared param differs from its default — drives a Reset control. */
  isFiltered: boolean;
  listState: ListState;
  onListStateChange: (next: ListState, options?: ListStateChangeOptions) => void;
}

const SORT_SEPARATOR = ':';



export function useListParams<S extends Record<string, ParamSpec<unknown>>>(
  specs: S,
  options: ListParamsOptions = {},
): ListParams<S> {
  const { ns, sort, pageSize = 25 } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const loc = useLocation();

  /** Its identity changes with every query-string change, so keep it out of deps. */
  const setSearchParamsRef = useRef(setSearchParams);
  setSearchParamsRef.current = setSearchParams;
  const stateRef = useRef(loc.state);
  stateRef.current = loc.state;
  const locPathRef = useRef(loc.pathname);
  locPathRef.current = loc.pathname;

  const key = useCallback((name: string) => (ns ? `${ns}.${name}` : name), [ns]);
  const pageKey = key('page');
  const sortKey = key('sort');

  /** Pending debounced text, by full URL key, plus a counter to force a render. */
  const pending = useRef(new Map<string, unknown>());
  const [draftVersion, bumpDraft] = useState(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
    },
    [],
  );

  /**
   * Callers declare their specs inline (`useListParams({ status: P.choice(…) })`),
   * so the object is new on every render and cannot be a dependency. The specs
   * are held in a ref and the memos key off the SEARCH STRING plus the spec names
   * — both stable strings. That keeps `values` referentially stable between
   * renders, so a caller may safely put it in a queryKey or a dependency array
   * without re-fetching on every render.
   */
  const specsRef = useRef(specs);
  specsRef.current = specs;
  const specNames = Object.keys(specs).join('|');
  const search = searchParams.toString();


  /** Entries from the ref, so values are typed as present rather than optional. */
  const entriesOf = useCallback(
    () => Object.entries(specsRef.current) as [string, ParamSpec<unknown>][],
    [],
  );

  const readValue = useCallback(
    (name: string, spec: ParamSpec<unknown>, params: URLSearchParams) => {
      const raw = params.get(ns ? `${ns}.${name}` : name);
      return raw === null ? spec.default : spec.parse(raw);
    },
    [ns],
  );

  const values = useMemo(() => {
    const params = new URLSearchParams(search);
    const out = {} as Values<S>;
    for (const [name, spec] of entriesOf()) {
      (out as Record<string, unknown>)[name] = readValue(name, spec, params);
    }
    return out;
  }, [search, specNames, readValue, entriesOf]);

  const draft = useMemo(() => {
    const out = { ...values } as Values<S>;
    for (const [name] of entriesOf()) {
      const full = ns ? `${ns}.${name}` : name;
      if (pending.current.has(full)) {
        (out as Record<string, unknown>)[name] = pending.current.get(full);
      }
    }
    return out;
    // draftVersion is the dependency that matters: `pending` is a ref, so a
    // keystroke bumps the counter and THAT is what re-derives this. Without it
    // the memo would hold the pre-keystroke value and the input would look dead.
  }, [values, specNames, ns, draftVersion, entriesOf]);

  /**
   * The one write path, so carrying location.state and reading the CURRENT query
   * string are not decisions anyone has to remember.
   *
   * The base is `window.location.search`, deliberately not the functional
   * updater's `prev`. React Router hands that updater the searchParams captured
   * by the render which created the setSearchParams — and with two lists on one
   * route, one list's write can leave a sibling component holding a snapshot from
   * before it. Writing through that snapshot silently RESURRECTS the old query
   * string and drops the sibling's key.
   *
   * Measured on /housing: type in the Residents search, wait for it to commit
   * (?residents.search=Dar is in the URL), then click the Homes tab — and
   * residents.search vanished. Switching tabs without typing preserved it, which
   * is what pointed at a stale snapshot rather than the merge logic. The browser's
   * URL is updated synchronously by history.push, so it is always current.
   */
  const write = useCallback(
    (mutate: (next: URLSearchParams) => void, replace: boolean) => {
      setSearchParamsRef.current(
        (prev) => {
          /**
           * Base on the LIVE browser URL, not on `prev` — see hazard 2 above.
           *
           * The pathname check is how we tell a browser-history router from a
           * MemoryRouter: under MemoryRouter (which the tests use) the window URL
           * never moves, so window.location.search would be permanently empty and
           * every write would wipe the query string. Matching pathnames means the
           * window URL really is this router's URL and is therefore authoritative.
           *
           * Consequence worth knowing: the tests exercise the `prev` path, so they
           * CANNOT catch the stale-snapshot bug. The evidence for that fix is the
           * measurement in hazard 2, reproduced in a real browser.
           */
          const live =
            typeof window !== 'undefined' && window.location.pathname === locPathRef.current
              ? window.location.search
              : prev.toString();
          const next = new URLSearchParams(live);
          mutate(next);
          return next;
        },
        // preventScrollReset: changing a filter must not jump a long list to the
        // top; state: the router drops it otherwise and BackLink disappears.
        { replace, state: stateRef.current, preventScrollReset: true },
      );
    },
    [],
  );

  /** Writes one value into `next`, deleting the key when it equals its default. */
  const apply = useCallback(
    (next: URLSearchParams, name: keyof S & string, value: unknown) => {
      const spec = specsRef.current[name];
      if (!spec) return;
      const full = key(name);
      // A default never appears in the URL: /participants stays /participants,
      // and ?page=1 is never written.
      if (value === spec.default) next.delete(full);
      else next.set(full, spec.serialize(value));
    },
    [key],
  );

  const commit = useCallback(
    (entries: [keyof S & string, unknown][], replace: boolean) => {
      const resets = entries.some(([name]) => specsRef.current[name]?.resetsPage !== false);
      write((next) => {
        for (const [name, value] of entries) apply(next, name, value);
        // Same transaction as the filter change — never a second write, which is
        // what made the old two-step reset flicker page 2 of the new results.
        if (resets) next.delete(pageKey);
      }, replace);
    },
    [specs, write, apply, pageKey],
  );

  const set = useCallback(
    <K extends keyof S>(name: K, value: Values<S>[K]) => {
      const field = name as keyof S & string;
      const spec = specs[field];
      const full = key(field);
      if (!spec) return;

      if (spec.debounceMs) {
        // Echo immediately so typing feels instant, commit to the URL once the
        // burst ends — one history entry for "Johnson", not seven.
        pending.current.set(full, value);
        bumpDraft((n) => n + 1);
        const existing = timers.current.get(full);
        if (existing) clearTimeout(existing);
        timers.current.set(
          full,
          setTimeout(() => {
            timers.current.delete(full);
            pending.current.delete(full);
            bumpDraft((n) => n + 1);
            commit([[field, value]], true);
          }, spec.debounceMs),
        );
        return;
      }
      commit([[field, value]], true);
    },
    [specs, key, commit],
  );

  const patch = useCallback(
    (next: Partial<Values<S>>) => {
      const entries = Object.entries(next) as [keyof S & string, unknown][];
      if (entries.length === 0) return;
      // Any pending debounce for these keys is now stale — the caller is setting
      // the value outright.
      for (const [name] of entries) {
        const full = key(name);
        const timer = timers.current.get(full);
        if (timer) {
          clearTimeout(timer);
          timers.current.delete(full);
        }
        pending.current.delete(full);
      }
      bumpDraft((n) => n + 1);
      commit(entries, true);
    },
    [key, commit],
  );

  const clear = useCallback(() => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
    pending.current.clear();
    bumpDraft((n) => n + 1);
    write((next) => {
      for (const [name] of entriesOf()) next.delete(key(name));
      next.delete(pageKey);
      next.delete(sortKey);
    }, true);
  }, [write, specNames, key, pageKey, sortKey, entriesOf]);

  const isFiltered = useMemo(() => {
    const params = new URLSearchParams(search);
    return entriesOf().some(([name, spec]) => readValue(name, spec, params) !== spec.default);
  }, [search, specNames, readValue, entriesOf]);

  const page = useMemo(() => {
    const raw = searchParams.get(pageKey);
    if (raw === null) return 1;
    const n = Number.parseInt(raw, 10);
    return Number.isInteger(n) && n > 0 ? n : 1;
  }, [searchParams, pageKey]);

  /** One key, `sort=lastName:desc`, so a sort toggle is a single atomic write. */
  const [sortBy, sortDir] = useMemo(() => {
    const raw = searchParams.get(sortKey);
    if (raw) {
      const [by, dir] = raw.split(SORT_SEPARATOR);
      if (by) return [by, dir === 'desc' ? 'desc' : 'asc'] as const;
    }
    return [sort?.by, sort?.dir ?? 'asc'] as const;
  }, [searchParams, sortKey, sort?.by, sort?.dir]);

  const listState = useMemo<ListState>(
    () => ({ page, pageSize, sortBy, sortDir }),
    [page, pageSize, sortBy, sortDir],
  );

  const onListStateChange = useCallback(
    (next: ListState, options?: ListStateChangeOptions) => {
      const sortChanged = next.sortBy !== sortBy || next.sortDir !== sortDir;
      write((params) => {
        if (next.page <= 1) params.delete(pageKey);
        else params.set(pageKey, String(next.page));

        const isDefaultSort = next.sortBy === sort?.by && next.sortDir === (sort?.dir ?? 'asc');
        if (!next.sortBy || isDefaultSort) params.delete(sortKey);
        else params.set(sortKey, `${next.sortBy}${SORT_SEPARATOR}${next.sortDir}`);
        // A sort change restarts at page 1; DataTable already asks for that, but
        // the URL must agree or a stale ?page= survives the sort.
        if (sortChanged) params.delete(pageKey);
        // The default is `sortChanged`, which is the whole rule: a SORT change
        // replaces, because Back should leave the screen rather than undo one
        // column click; a PAGE change pushes, because paging is the one movement
        // a user expects Back to undo, and it is bounded by the page count.
        //
        // The caller overrides it for a change the USER did not make — DataTable
        // snapping a bookmarked out-of-range page back to the last real one. A
        // pushed correction would put the page that does not exist behind the
        // Back button, which is exactly where it should not be.
      }, options?.replace ?? sortChanged);
    },
    [write, pageKey, sortKey, sort?.by, sort?.dir, sortBy, sortDir],
  );

  return { values, draft, set, patch, clear, isFiltered, listState, onListStateChange };
}
