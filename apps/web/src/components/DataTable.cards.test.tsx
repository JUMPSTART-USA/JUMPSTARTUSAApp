import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataTable, type Column } from './DataTable';

/**
 * Card mode: below `sm`, a table that opted in renders rows as cards.
 *
 * The two promises these tests hold are the ones the design sketch called out
 * as the costs of the format. Phase 2's guarantee — every row reachable by
 * keyboard — must be re-proven in the new markup, because the old proof was
 * about table cells. And sorting must survive losing the column headers it
 * lived in, through the same URL-backed list state.
 *
 * jsdom has no matchMedia, so the hook reports desktop by default and every
 * OTHER DataTable test keeps exercising table mode untouched. These tests stub
 * matchMedia to say "phone" — the stub is the whole difference.
 */

const phone = (matches: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
};

beforeEach(() => phone(true));
afterEach(() => vi.unstubAllGlobals());

interface Row {
  id: string;
  name: string;
  status: string;
  manager: string;
  intake: string;
  extra: string;
}

const rows: Row[] = [
  { id: 'r1', name: 'Darnell Casteel', status: 'Active', manager: 'Unassigned', intake: 'Aug 23', extra: 'X1' },
  { id: 'r2', name: 'Terrence Casteel', status: 'Completed', manager: 'Rachel W', intake: 'Apr 17', extra: 'X2' },
];

const columns: Column<Row>[] = [
  { key: 'number', header: 'Number', render: (r) => r.id, card: 'meta' },
  { key: 'name', header: 'Name', sortKey: 'lastName', render: (r) => r.name },
  { key: 'status', header: 'Status', sortKey: 'status', render: (r) => r.status, card: 'status' },
  { key: 'manager', header: 'Case manager', render: (r) => r.manager, card: 'field' },
  { key: 'intake', header: 'Intake', sortKey: 'intake', render: (r) => r.intake, card: 'field' },
  { key: 'extra', header: 'Extra', render: (r) => r.extra },
];

const LIST_STATE = { page: 1, pageSize: 25, sortDir: 'asc' as const };
const data = { items: rows, total: 2, page: 1, pageSize: 25 };

const mount = (props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) => {
  const onStateChange = vi.fn();
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <DataTable<Row>
          cards
          columns={columns}
          data={data}
          isLoading={false}
          state={LIST_STATE}
          onStateChange={onStateChange}
          rowHref={(r) => `/people/${r.id}`}
          linkColumnKey="name"
          {...props}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { onStateChange };
};

describe('card mode renders only when opted in AND on a phone', () => {
  it('renders cards below sm for an opted-in table', () => {
    mount();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('keeps the table on desktop even when opted in', () => {
    phone(false);
    mount();
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  /** Mutation: default `cards` on and this fails — the 50 untouched lists
      must keep their table on phones until each decides otherwise. */
  it('keeps the table on a phone for tables that did not opt in', () => {
    mount({ cards: false });
    expect(screen.getByRole('table')).toBeTruthy();
  });
});

describe('the Phase 2 keyboard guarantee, re-proven in card markup', () => {
  /** Mutation: render the identity as a plain div and this fails. */
  it('renders the identity as a real link with an href', () => {
    mount();
    const link = screen.getByRole('link', { name: 'Darnell Casteel' });
    expect(link.getAttribute('href')).toBe('/people/r1');
  });

  it('renders the identity as a button for dialog-opening lists', () => {
    const onRowOpen = vi.fn();
    mount({ rowHref: undefined, onRowOpen });
    fireEvent.click(screen.getByRole('button', { name: 'Darnell Casteel' }));
    expect(onRowOpen).toHaveBeenCalledWith(rows[0]);
  });
});

describe('the card plan', () => {
  it('places hinted columns in their slots and repeats field labels per card', () => {
    mount();
    const card = screen.getAllByRole('listitem')[0]!;
    expect(within(card).getByText('r1')).toBeTruthy();
    expect(within(card).getByText('Active')).toBeTruthy();
    // Labels repeat on every card — the table header did this once for 25 rows.
    expect(screen.getAllByText('Case manager')).toHaveLength(2);
    expect(within(card).getByText('Unassigned')).toBeTruthy();
  });

  /** Mutation: show every column and this fails — unhinted columns beyond the
      explicit fields drop off the phone, where the record is a tap away. */
  it('hides unhinted columns once explicit fields exist', () => {
    mount();
    expect(screen.queryByText('X1')).toBeNull();
    expect(screen.queryByText('Extra')).toBeNull();
  });
});

describe('sorting, rehoused from the vanished column headers', () => {
  it('drives the same list state and resets to page 1', () => {
    const { onStateChange } = mount({ state: { ...LIST_STATE, page: 3 } });
    // FilterSelect is the kit's SelectMenu, not a native select: open the
    // listbox, then choose the option.
    fireEvent.click(screen.getByRole('button', { name: 'Sort by' }));
    fireEvent.click(screen.getByRole('option', { name: 'Intake' }));
    expect(onStateChange).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
      sortBy: 'intake',
      sortDir: 'asc',
    });
  });

  /** Mutation: drop `page: 1` from the direction toggle and this fails —
      flipping direction on page 3 of the old order strands the reader. */
  it('resets to page 1 when the direction flips', () => {
    const { onStateChange } = mount({
      state: { ...LIST_STATE, page: 3, sortBy: 'intake' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Sorted ascending/ }));
    expect(onStateChange).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
      sortBy: 'intake',
      sortDir: 'desc',
    });
  });
});

describe('parity with table mode', () => {
  it('keeps the empty-state fork and the chapter scope line', () => {
    vi.mock('@/lib/auth', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/lib/auth')>()),
      useOptionalAuth: () => ({ user: { chapter: 'SC' } }),
    }));
    mount({
      data: { items: [], total: 0, page: 1, pageSize: 25 },
      isFiltered: true,
      chapterScoped: true,
    });
    expect(screen.getByText('No matches for these filters')).toBeTruthy();
    expect(screen.getByText('Showing the South Carolina chapter only.')).toBeTruthy();
  });

  it('keeps the pagination footer', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeTruthy();
    expect(screen.getByText(/Page 1 of/)).toBeTruthy();
  });
});
