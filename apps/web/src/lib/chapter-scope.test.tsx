import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ChapterFilterSelect, ChapterScopeBadge } from '@/components/ChapterSelect';
import { DataTable } from '@/components/DataTable';
import { EntityPicker } from '@/components/ui/entity-picker';

/**
 * Chapter-scope visibility: a scoped user's copy names the SLICE their session
 * views, so an empty result reads "none in my chapter" rather than "none
 * anywhere".
 *
 * The safety rule these tests enforce is the reason the feature is allowed to
 * exist at all: every string is a pure function of the SESSION, decided before
 * any request runs. §7.2 requires "a matching record exists in another chapter"
 * and "no matching record exists anywhere" to render identically — and copy
 * that never sees a query result cannot tell them apart. So the mutations these
 * catch are the ones that would break that: copy computed from data, or scope
 * claims on surfaces whose query is not actually chapter-filtered.
 */

const auth = vi.hoisted(() => ({
  state: { user: null as { chapter: string | null } | null },
}));
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  useAuth: () => auth.state,
  useOptionalAuth: () => auth.state,
}));

const scoped = () => (auth.state = { user: { chapter: 'SC' } });
const allChapters = () => (auth.state = { user: { chapter: null } });

const LIST_STATE = { page: 1, pageSize: 25, sortDir: 'asc' as const };
const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('the toolbar slot', () => {
  it('shows the scope chip to a scoped session where all-chapters users get the filter', () => {
    scoped();
    render(<ChapterFilterSelect value="" onChange={() => {}} />);
    expect(screen.getByText('South Carolina chapter')).toBeTruthy();
    expect(screen.queryByLabelText('Chapter')).toBeNull();
  });

  it('shows the live filter to an all-chapters session, and no chip', () => {
    allChapters();
    render(<ChapterFilterSelect value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Chapter')).toBeTruthy();
    expect(screen.queryByText(/chapter$/)).toBeNull();
  });

  /**
   * A session can be narrowed by an admin's chapter PREVIEW, not only by an
   * account scope — "Your account views…" would be false for them. Mutation:
   * word the title around the account and this fails.
   */
  it('describes the VIEW, not the account', () => {
    scoped();
    render(<ChapterScopeBadge />);
    expect(screen.getByTitle('Viewing the South Carolina chapter')).toBeTruthy();
  });
});

describe('the DataTable scope line', () => {
  const columns = [{ key: 'name', header: 'Name', render: () => null }];
  const empty = { items: [], total: 0, page: 1, pageSize: 25 };

  const table = (props: Partial<React.ComponentProps<typeof DataTable>>) =>
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc()}>
          <DataTable
            columns={columns}
            data={empty}
            isLoading={false}
            state={LIST_STATE}
            onStateChange={() => {}}
            {...props}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    );

  it('names the slice under the unfiltered branch for a scoped session', () => {
    scoped();
    table({ chapterScoped: true, emptyMessage: 'No donors found' });
    expect(screen.getByText('No donors found')).toBeTruthy();
    expect(screen.getByText('Showing the South Carolina chapter only.')).toBeTruthy();
  });

  it('names the slice under the filtered branch too', () => {
    scoped();
    table({ chapterScoped: true, isFiltered: true });
    expect(screen.getByText('No matches for these filters')).toBeTruthy();
    expect(screen.getByText('Showing the South Carolina chapter only.')).toBeTruthy();
  });

  /**
   * The flag is a claim about the ENDPOINT, so an unflagged table must say
   * nothing even for a scoped session — TasksPage deliberately shows
   * chapter-neutral staff to-dos, where the line would be false. Mutation:
   * default chapterScoped on and this fails.
   */
  it('says nothing on unflagged tables', () => {
    scoped();
    table({});
    expect(screen.queryByText(/chapter only/)).toBeNull();
  });

  it('says nothing to an all-chapters session', () => {
    allChapters();
    table({ chapterScoped: true });
    expect(screen.queryByText(/chapter only/)).toBeNull();
  });

  /**
   * Seven CRM pages stack an ErrorState above an UNCONDITIONAL DataTable, so on
   * a failed first load `data` is undefined while the empty cell renders. A
   * scope line there would dress an error up as a confirmed empty chapter.
   * Mutation: drop the `data &&` guard in DataTable and this fails.
   */
  it('does not claim a confirmed-empty chapter while the query is unresolved', () => {
    scoped();
    table({ chapterScoped: true, data: undefined });
    expect(screen.queryByText(/chapter only/)).toBeNull();
  });
});

describe('the picker zero-result row', () => {
  const picker = (chapterScoped: boolean) =>
    render(
      <QueryClientProvider client={qc()}>
        <EntityPicker
          value={null}
          onChange={() => {}}
          queryKey="test-picker"
          minChars={0}
          chapterScoped={chapterScoped}
          search={async () => []}
        />
      </QueryClientProvider>,
    );

  it('names the slice on a scoped, flagged picker', async () => {
    scoped();
    picker(true);
    expect(await screen.findByText('No matches in the South Carolina chapter')).toBeTruthy();
  });

  /**
   * OPT-IN: MergePage's picker searches org-wide and the household picker
   * searches the DONOR's chapter — the session suffix would be false on both.
   * Mutation: make the suffix unconditional inside EntityPicker and this fails.
   */
  it('keeps the plain copy on unflagged pickers even for a scoped session', async () => {
    scoped();
    picker(false);
    expect(await screen.findByText('No matches')).toBeTruthy();
    expect(screen.queryByText(/chapter/)).toBeNull();
  });
});
