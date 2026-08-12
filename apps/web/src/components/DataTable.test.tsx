import { render, screen } from '@testing-library/react';
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
  const view = render(
    <MemoryRouter>
      <DataTable<Row>
        columns={columns}
        data={page(rows, 60)}
        isLoading={false}
        state={state}
        onStateChange={onStateChange}
        {...props}
      />
    </MemoryRouter>,
  );
  return { ...view, onStateChange };
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
