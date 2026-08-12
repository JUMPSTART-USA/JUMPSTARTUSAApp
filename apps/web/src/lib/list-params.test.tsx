import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P, useListParams } from './list-params';

/**
 * Every one of these pins a behaviour that cannot be seen by reading the code or
 * by clicking around once: how many URL writes a burst of typing produces,
 * whether Back undoes a filter or leaves the screen, whether a hand-edited query
 * string can reach the API, and whether the router quietly dropped the state that
 * BackLink depends on.
 */

const STATUSES = ['pending', 'approved', 'rejected'] as const;

function Harness({
  ns,
  defaultStatus = '',
}: {
  ns?: string;
  defaultStatus?: (typeof STATUSES)[number] | '';
}) {
  const lp = useListParams(
    {
      q: P.text(),
      status: P.choice(STATUSES, defaultStatus),
    },
    { ns, sort: { by: 'name', dir: 'asc' } },
  );
  const loc = useLocation();
  const navType = useNavigationType();
  const prefix = ns ? `${ns}-` : '';
  return (
    <div>
      <p data-testid={`${prefix}search`}>{loc.search}</p>
      <p data-testid={`${prefix}navtype`}>{navType}</p>
      <p data-testid={`${prefix}values`}>{JSON.stringify(lp.values)}</p>
      <p data-testid={`${prefix}draft`}>{JSON.stringify(lp.draft)}</p>
      <p data-testid={`${prefix}liststate`}>{JSON.stringify(lp.listState)}</p>
      <p data-testid={`${prefix}filtered`}>{String(lp.isFiltered)}</p>
      <p data-testid={`${prefix}back`}>
        {(loc.state as { back?: { label: string } } | null)?.back?.label ?? 'NONE'}
      </p>
      <button type="button" onClick={() => lp.set('q', 'Johnson')}>
        {prefix}type-johnson
      </button>
      <button type="button" onClick={() => lp.set('status', 'approved')}>
        {prefix}approve
      </button>
      <button type="button" onClick={() => lp.set('status', '')}>
        {prefix}clear-status
      </button>
      <button type="button" onClick={() => lp.patch({ status: 'rejected', q: 'both' })}>
        {prefix}patch-two
      </button>
      <button type="button" onClick={() => lp.clear()}>
        {prefix}clear
      </button>
      <button type="button" onClick={() => lp.onListStateChange({ ...lp.listState, page: 3 })}>
        {prefix}page-3
      </button>
      <button
        type="button"
        onClick={() => lp.onListStateChange({ ...lp.listState, sortBy: 'date', sortDir: 'desc' })}
      >
        {prefix}sort-date
      </button>
    </div>
  );
}

const search = (ns?: string) => screen.getByTestId(`${ns ? `${ns}-` : ''}search`).textContent ?? '';
const values = (ns?: string) =>
  JSON.parse(screen.getByTestId(`${ns ? `${ns}-` : ''}values`).textContent ?? '{}');
const draft = (ns?: string) =>
  JSON.parse(screen.getByTestId(`${ns ? `${ns}-` : ''}draft`).textContent ?? '{}');
const listState = () => JSON.parse(screen.getByTestId('liststate').textContent ?? '{}');
const click = (name: string) => act(() => screen.getByRole('button', { name }).click());

function mount(initial = '/list', node?: React.ReactNode) {
  return render(<MemoryRouter initialEntries={[initial]}>{node ?? <Harness />}</MemoryRouter>);
}

describe('useListParams — the URL is the storage', () => {
  it('keeps defaults out of the URL, and never writes page=1', () => {
    mount();
    expect(search()).toBe('');
    expect(listState()).toEqual({ page: 1, pageSize: 25, sortBy: 'name', sortDir: 'asc' });
    expect(screen.getByTestId('filtered').textContent).toBe('false');

    click('approve');
    // Only the non-default key appears.
    expect(search()).toBe('?status=approved');
    expect(screen.getByTestId('filtered').textContent).toBe('true');
  });

  it('drops a param again when it returns to its default', () => {
    mount('/list?status=approved');
    expect(values().status).toBe('approved');
    click('clear-status');
    // '' is this spec's default here, so the key goes rather than lingering empty.
    expect(search()).toBe('');
  });

  it('treats an empty value as "explicitly cleared" when the default is not empty', () => {
    render(
      <MemoryRouter initialEntries={['/list']}>
        <Harness defaultStatus="pending" />
      </MemoryRouter>,
    );
    // Absent means the default…
    expect(values().status).toBe('pending');
    click('clear-status');
    // …and empty has to survive in the URL, or a user could never ask for
    // every status on a list that defaults to pending.
    expect(search()).toBe('?status=');
    expect(values().status).toBe('');
  });
});

describe('useListParams — writes', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('coalesces a burst of typing into ONE url write, echoing the draft immediately', () => {
    mount();
    const writes: string[] = [];
    // set() four times in quick succession, as typing would.
    for (const _ of [1, 2, 3, 4]) {
      click('type-johnson');
      writes.push(search());
    }
    // Nothing committed yet: the URL is untouched during the burst.
    expect(writes.every((w) => w === '')).toBe(true);
    // But the control is not dead — draft echoes at once while values lag.
    expect(draft().q).toBe('Johnson');
    expect(values().q).toBe('');

    act(() => vi.advanceTimersByTime(300));
    expect(search()).toBe('?q=Johnson');
    expect(values().q).toBe('Johnson');
    expect(draft().q).toBe('Johnson');
  });

  it('replaces history for a filter change, and pushes for a page change', () => {
    mount();
    click('approve');
    // Back should leave the screen, not undo one dropdown.
    expect(screen.getByTestId('navtype').textContent).toBe('REPLACE');

    click('page-3');
    // Paging is the one movement a user expects Back to undo.
    expect(screen.getByTestId('navtype').textContent).toBe('PUSH');
    expect(search()).toBe('?status=approved&page=3');
  });

  it('resets to page 1 in the SAME write as the filter change', () => {
    mount('/list?page=4&status=approved');
    expect(listState().page).toBe(4);
    click('clear-status');
    // One write: the page key is gone, not briefly left pointing at page 4 of a
    // different result set.
    expect(search()).toBe('');
    expect(listState().page).toBe(1);
  });

  it('lands both keys when patch() writes two at once', () => {
    mount();
    click('patch-two');
    const params = new URLSearchParams(search());
    // Two set() calls in one tick would clobber each other — the router's
    // functional updater sees the render-closure snapshot, so the second wins.
    expect(params.get('status')).toBe('rejected');
    expect(params.get('q')).toBe('both');
  });

  it('clear() drops every declared param, the page and the sort', () => {
    mount('/list?q=x&status=approved&page=5&sort=date:desc&keep=me');
    click('clear');
    // …and leaves params it does not own alone.
    expect(search()).toBe('?keep=me');
  });

  it('drops the sort key when the sort returns to the list default', () => {
    mount();
    click('sort-date');
    expect(new URLSearchParams(search()).get('sort')).toBe('date:desc');
    expect(listState().sortBy).toBe('date');
  });
});

describe('useListParams — a URL is untrusted input', () => {
  it('parses garbage back to the default rather than passing it to the API', () => {
    mount('/list?page=-3&status=nonsense&q=fine');
    expect(listState().page).toBe(1);
    expect(values().status).toBe('');
    expect(values().q).toBe('fine');
  });

  it('ignores a non-numeric page', () => {
    mount('/list?page=abc');
    expect(listState().page).toBe(1);
  });
});

describe('useListParams — the two router hazards', () => {
  it('carries location.state through a write, so BackLink survives', () => {
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/list', state: { back: { label: 'Dashboard' } } }]}
      >
        <Harness />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('back').textContent).toBe('Dashboard');
    click('approve');
    // setSearchParams navigates without state; 18 <BackLink stateOnly /> sites
    // render nothing when it is missing, so the breadcrumb would vanish.
    expect(screen.getByTestId('back').textContent).toBe('Dashboard');
    expect(search()).toBe('?status=approved');
  });

  it('namespaces keys so two lists on one screen do not page each other', () => {
    render(
      <MemoryRouter initialEntries={['/requests']}>
        <Harness ns="msg" />
        <Harness ns="trn" />
      </MemoryRouter>,
    );
    click('msg-approve');
    click('trn-page-3');

    const params = new URLSearchParams(search('msg'));
    expect(params.get('msg.status')).toBe('approved');
    expect(params.get('trn.page')).toBe('3');
    // The untouched list keeps its own page, and neither owns a bare `page`.
    expect(params.get('page')).toBeNull();
    expect(params.get('msg.page')).toBeNull();
    expect(values('trn').status).toBe('');
  });
});
