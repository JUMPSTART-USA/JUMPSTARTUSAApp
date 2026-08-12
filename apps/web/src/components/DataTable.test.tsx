import { render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, initialListState, type Column, type ListState } from './DataTable';

/**
 * The audit's most expensive list defect: changing page threw the rows away, so
 * ~1,200px of table collapsed to a 128px spinner and back — a ~1,000px layout
 * shift each way that also discarded scroll position, while the footer briefly
 * reported the wrong page count.
 *
 * These pin the staleness contract, because none of it is visible to tsc: rows
 * survive a refetch, the table says so, and the pager cannot be clicked into a
 * page the incoming result set may not have.
 */

interface Row {
  id: string;
  name: string;
}

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', render: (r) => r.name },
];

const page = (items: Row[], total: number, pageNumber = 1) => ({
  items,
  total,
  page: pageNumber,
  pageSize: 25,
});

const rows = [
  { id: '1', name: 'Ada' },
  { id: '2', name: 'Grace' },
];

function mount(props: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
  const onStateChange = vi.fn();
  const state: ListState = { ...initialListState, page: 1 };
  const ui = (extra: typeof props = {}) => (
    <MemoryRouter>
      <DataTable<Row>
        columns={columns}
        data={page(rows, 60)}
        isLoading={false}
        state={state}
        onStateChange={onStateChange}
        {...props}
        {...extra}
      />
    </MemoryRouter>
  );
  const view = render(ui());
  return {
    ...view,
    onStateChange,
    rerenderWith: (extra: typeof props = {}) => view.rerender(ui(extra)),
  };
}

const table = () => screen.getByRole('table');
const pager = (label: string) => screen.getByLabelText(label) as HTMLButtonElement;
const body = () => table().querySelector('tbody')!;

describe('DataTable loading and staleness', () => {
  it('shows a spinner only on the FIRST load, when there is nothing to keep', () => {
    mount({ data: undefined, isLoading: true });
    expect(screen.queryByText('Ada')).toBeNull();
    expect(table().getAttribute('aria-busy')).toBe('true');
  });

  it('keeps the previous rows on screen while refetching, instead of blanking', () => {
    mount({ isFetching: true });
    // The whole point: the rows are still there.
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.getByText('Grace')).toBeTruthy();
    expect(table().getAttribute('aria-busy')).toBe('true');
  });

  it('dims stale rows only to 90%, which is the AA limit on these tokens', () => {
    mount({ isFetching: true });
    // opacity-70 would put --muted-foreground at 3.16:1, under the 4.5:1 floor
    // this codebase just remediated. 90% measures 4.85:1.
    expect(body().className).toContain('opacity-90');
    expect(body().className).not.toContain('opacity-70');
    expect(body().className).not.toContain('opacity-60');
  });

  it('is not dim or busy at rest', () => {
    mount({ isFetching: false });
    expect(body().className).not.toContain('opacity-90');
    expect(table().getAttribute('aria-busy')).toBe('false');
  });

  it('shows a spinner in the footer, so the dim is not the only cue', () => {
    const { container } = mount({ isFetching: true });
    // Opacity alone is a contrast-only signal; at 90% it is too quiet to carry it.
    expect(container.querySelector('.animate-spin')).toBeTruthy();
    expect(screen.getByText('60 records')).toBeTruthy();
  });

  it('disables both pagers while stale, so Next cannot overshoot a narrowed result set', () => {
    // totalPages comes from the PREVIOUS total. After a filter that narrows the
    // results, an enabled Next would page past the end of the incoming set.
    mount({ isFetching: true, state: { ...initialListState, page: 2 } });
    expect(pager('Next page').disabled).toBe(true);
    expect(pager('Previous page').disabled).toBe(true);
  });

  it('leaves the pagers usable at rest', () => {
    mount({ isFetching: false, state: { ...initialListState, page: 2 } });
    expect(pager('Next page').disabled).toBe(false);
    expect(pager('Previous page').disabled).toBe(false);
  });

  it('infers nothing when no isFetching is passed, even if the echoed page disagrees', () => {
    /**
     * There used to be a `data.page !== state.page` fallback here. It reached no
     * code path in the app, and it could latch permanently: `stale` disables both
     * pagers, so a list that moved state.page without changing its query key — a
     * migration that forgets to send the page — would dim forever with no escape.
     * A missing isFetching must cost a missing dim, never a dead screen.
     */
    // Page 2 of 3 (60 records / 25), so both pagers are legitimately live and a
    // latch would be visible as them going dead.
    mount({ state: { ...initialListState, page: 2 }, data: page(rows, 60, 1) });
    expect(body().className).not.toContain('opacity-90');
    expect(table().getAttribute('aria-busy')).toBe('false');
    expect(pager('Next page').disabled).toBe(false);
    expect(pager('Previous page').disabled).toBe(false);
  });

  it('still renders the empty state, and calls it empty rather than stale', () => {
    mount({ data: page([], 0), isFetching: false, emptyMessage: 'No donors found' });
    expect(screen.getByText('No donors found')).toBeTruthy();
    expect(table().getAttribute('aria-busy')).toBe('false');
  });
});

/**
 * Page numbers live in the URL now, so a shared or bookmarked link can ask for a
 * page its result set no longer has — /intake?apps.page=2 on a four-record queue
 * read "Page 2 of 1" over an empty table. What follows pins the correction AND
 * its three guards, none of which tsc can see: it waits for a settled response,
 * it replaces rather than pushes, and it cannot become a loop.
 */
describe('DataTable — a page past the end', () => {
  // 60 records at 25 a page is 3 pages, so page 5 is two past the end.
  const beyond: ListState = { ...initialListState, page: 5 };

  it('snaps to the last real page', () => {
    const { onStateChange } = mount({ state: beyond, data: page([], 60, 5) });
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith({ ...initialListState, page: 3 }, { replace: true });
  });

  it('replaces rather than pushes, because the user never asked to come here', () => {
    // The options argument is the whole point: reusing the normal page path
    // would put the page that does not exist behind the Back button.
    const { onStateChange } = mount({ state: beyond, data: page([], 60, 5) });
    expect(onStateChange.mock.calls[0]?.[1]).toEqual({ replace: true });
  });

  it('snaps an emptied result set back to page 1, not to page 0', () => {
    // totalPages floors at 1, so "no records at all" still lands somewhere real
    // — the case behind the Acknowledgments queue's empty-state gate.
    const { onStateChange } = mount({ state: { ...initialListState, page: 3 }, data: page([], 0) });
    expect(onStateChange).toHaveBeenCalledWith({ ...initialListState, page: 1 }, { replace: true });
  });

  it('leaves an in-range page alone', () => {
    const { onStateChange } = mount({ state: { ...initialListState, page: 2 } });
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it('leaves the last page alone, rather than treating the boundary as past it', () => {
    const { onStateChange } = mount({ state: { ...initialListState, page: 3 } });
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it('does not fire on the first load, when there is no total to judge against', () => {
    // The dangerous one: firing here would fight the request already in flight
    // and send the list back to page 1 before its own page ever arrived.
    const { onStateChange } = mount({ state: beyond, data: undefined, isLoading: true });
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it('does not fire while loading, even with a previous total still in hand', () => {
    // isLoading with data present should not arise, and the guard deliberately
    // does not lean on that: loading means the total on hand, if any, is not an
    // answer to the request that is out.
    const { onStateChange } = mount({ state: beyond, data: page(rows, 60), isLoading: true });
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it('does not fire while stale, when the total belongs to the previous query', () => {
    // Same reason both pagers are disabled here: totalPages is the OLD result
    // set's, and the incoming one may well have the page being asked for.
    const { onStateChange } = mount({ state: beyond, data: page(rows, 60), isFetching: true });
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it('snaps once per page, so an echoed out-of-range page cannot ping-pong', () => {
    /**
     * The loop this guards is not a re-render — identical deps do not re-run an
     * effect. It is a new RESPONSE carrying the same answer: every refetch
     * (react-query hands back a fresh object on each window focus) re-runs the
     * effect, so if the parent never applied the snap, each one would fire
     * another navigation forever. Same page, same total, new object.
     */
    const { onStateChange, rerenderWith } = mount({ state: beyond, data: page([], 60, 5) });
    expect(onStateChange).toHaveBeenCalledTimes(1);
    rerenderWith({ data: page([], 60, 5) });
    rerenderWith({ data: page([], 60, 5) });
    expect(onStateChange).toHaveBeenCalledTimes(1);
  });

  it('snaps again once the page it lands on is ALSO past the end', () => {
    // Records deleted under us: the target walks down rather than latching, and
    // it terminates because totalPages is always below a page past the end.
    const { onStateChange, rerenderWith } = mount({ state: beyond, data: page([], 60, 5) });
    const lastCall = () => onStateChange.mock.calls.at(-1);
    expect(lastCall()).toEqual([{ ...initialListState, page: 3 }, { replace: true }]);
    // The parent applied page 3, and by the time it loaded only 25 records were left.
    rerenderWith({ state: { ...initialListState, page: 3 }, data: page([], 25, 3) });
    expect(onStateChange).toHaveBeenCalledTimes(2);
    expect(lastCall()).toEqual([{ ...initialListState, page: 1 }, { replace: true }]);
  });

  it('works against a bare useState setter, which is what most lists still pass', () => {
    /**
     * Most lists are not on useListParams yet: their `onStateChange` IS
     * `setListState`, a one-argument dispatch. The options argument has to be
     * something they can ignore for free — a store with no history has nothing
     * to replace. They reach this by having a total shrink under them rather
     * than by a bookmarked URL, but the correction is the same one.
     */
    function Unmigrated() {
      const [listState, setListState] = useState<ListState>({ ...initialListState, page: 5 });
      return (
        <>
          <p data-testid="page">{listState.page}</p>
          <DataTable<Row>
            columns={columns}
            data={page([], 60, 5)}
            isLoading={false}
            state={listState}
            onStateChange={setListState}
          />
        </>
      );
    }
    render(
      <MemoryRouter>
        <Unmigrated />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('page').textContent).toBe('3');
    expect(screen.getByText('Page 3 of 3')).toBeTruthy();
  });

  it('forgets the attempt once the page is in range, so a page that fills up is reachable', () => {
    const { onStateChange, rerenderWith } = mount({ state: beyond, data: page([], 60, 5) });
    expect(onStateChange).toHaveBeenCalledTimes(1);
    // The result set grew — page 5 is real now, and nothing should touch it.
    rerenderWith({ data: page(rows, 200, 5) });
    expect(onStateChange).toHaveBeenCalledTimes(1);
    // It shrank again, and the correction is available a second time.
    rerenderWith({ data: page([], 60, 5) });
    expect(onStateChange).toHaveBeenCalledTimes(2);
  });
});
