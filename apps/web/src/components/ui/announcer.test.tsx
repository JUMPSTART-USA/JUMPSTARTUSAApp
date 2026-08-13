import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveAnnouncer } from './announcer';
import { announce } from '@/lib/announce';
import { api } from '@/lib/api';

/**
 * The audit's finding: 101 mutations complete in silence. A sighted user infers
 * success from the dialog closing and the row appearing; a screen-reader user
 * gets nothing, and cannot tell a save that worked from one that quietly did
 * nothing.
 *
 * These pin the announcement itself, and the two things about it most likely to
 * be broken by a later edit: a DELETE answers 204 and returns EARLY from the
 * request path, and a live region only speaks when its text CHANGES, so saving
 * twice in a row is the case that silently regresses.
 */

const region = () => screen.getByRole('status');

/**
 * The store is module-level — one announcer for the app — so it carries whatever
 * an earlier test said. "Silent" therefore has to mean "said nothing NEW", which
 * is also the property that actually matters: this request must not put words in
 * the region.
 */
async function saysNothingNew(action: () => Promise<unknown>) {
  const before = region().textContent;
  await action();
  expect(region().textContent).toBe(before);
}

function mockFetch(status: number, body: unknown = {}) {
  return vi.fn(async () =>
    status === 204
      ? new Response(null, { status })
      : new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
  );
}

beforeEach(() => {
  render(<LiveAnnouncer />);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the live announcer', () => {
  it('repeats an identical message, because a live region only speaks on change', async () => {
    announce('Saved');
    await waitFor(() => expect(region().textContent).toContain('Saved'));
    const first = region().textContent;

    announce('Saved');
    // Same words, different text — the zero-width space is what makes the second
    // save audible at all.
    await waitFor(() => expect(region().textContent).not.toBe(first));
    expect(region().textContent).toContain('Saved');
  });
});

describe('what the API client announces', () => {
  it('says "Saved" after a successful write', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { id: '1' }));
    await api.patch('/volunteers/1', { status: 'active' });
    await waitFor(() => expect(region().textContent).toContain('Saved'));
  });

  it('says "Deleted" after a DELETE, which answers 204 and returns early', async () => {
    vi.stubGlobal('fetch', mockFetch(204));
    await api.delete('/case-notes/1');
    await waitFor(() => expect(region().textContent).toContain('Deleted'));
    expect(region().textContent).not.toContain('Saved');
  });

  it('stays silent for reads', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { items: [] }));
    await saysNothingNew(() => api.get('/volunteers'));
  });

  it('stays silent for a failed write', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { message: 'Validation failed' }));
    // Announcing a save that did not happen is worse than announcing nothing.
    await saysNothingNew(() => expect(api.post('/volunteers', {})).rejects.toThrow());
  });

  it.each([
    ['/participants/duplicate-check', 'a lookup shaped like a POST'],
    ['/admin/person-merge/preview', 'a preview, not a merge'],
    ['/auth/view-as', 'the chapter switch, which has its own banner'],
  ])('stays silent for %s (%s)', async (path) => {
    vi.stubGlobal('fetch', mockFetch(200, { candidates: [] }));
    await saysNothingNew(() => api.post(path, {}));
  });
});
