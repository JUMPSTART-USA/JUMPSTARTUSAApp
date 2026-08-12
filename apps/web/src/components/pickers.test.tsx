import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ParticipantPicker, useParticipantOption, useVolunteerOption } from './pickers';

/**
 * WHICH endpoint a picker rehydrates through is a §7.2 decision, not a detail.
 *
 * `GET /participants/:id` answers 404 for an id in another chapter, and a 404 is
 * an error — so the chip would say "Couldn't load" for a record that exists and
 * "A record you can't view" only by accident, or worse, the reverse: a
 * distinguishable answer that turns a filter chip into an existence oracle for
 * other chapters' records. The list endpoint runs the same chapter-scoped where
 * clause the typeahead already searches, so a foreign id is an EMPTY PAGE.
 *
 * It is also 570 bytes instead of a full profile with offenses and contacts —
 * justice-history data that has no business being fetched to label a filter.
 *
 * Anyone "simplifying" this to the detail route breaks both. Hence the test.
 */

const get = vi.fn();
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: (path: string) => get(path) } };
});

const ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => get.mockReset());

describe('picker rehydration lookups', () => {
  it.each([
    ['participant', useParticipantOption, '/participants'],
    ['volunteer', useVolunteerOption, '/volunteers'],
  ])('resolves a %s through the list endpoint, never GET /:id', async (_name, hook, path) => {
    get.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 1 });
    const { result } = renderHook(() => hook(ID), { wrapper });

    await waitFor(() => expect(get).toHaveBeenCalled());
    const requested = String(get.mock.calls[0]?.[0]);
    expect(requested).toContain(`${path}?`);
    expect(requested).toContain(`id=${ID}`);
    expect(requested).toContain('pageSize=1');
    // The detail route, which would 404 across chapters.
    expect(requested).not.toBe(`${path}/${ID}`);

    await waitFor(() => expect(result.current.status).toBe('unresolvable'));
    expect(result.current.value).toBeNull();
  });

  it('labels a participant the same way the typeahead does', async () => {
    get.mockResolvedValue({
      items: [
        { id: ID, participantNumber: 'P-0001', person: { firstName: 'Ada', lastName: 'Lovelace' } },
      ],
      total: 1,
      page: 1,
      pageSize: 1,
    });
    const { result } = renderHook(() => useParticipantOption(ID), { wrapper });

    // A chip that spelled the name differently from the search result the user
    // picked would read as a different record — one mapper feeds both.
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.value).toEqual({
      id: ID,
      label: 'Ada Lovelace',
      sublabel: 'P-0001',
    });
  });

  it('asks for nothing when there is no id in the URL', () => {
    renderHook(() => useParticipantOption(''), { wrapper });
    expect(get).not.toHaveBeenCalled();
  });

  it('does not look up a name the user just picked off the results list', async () => {
    // The URL-backed shape: the control reports an option, the page keeps only
    // the id, and the hook is asked for the label straight back.
    function Page() {
      const [id, setId] = useState('');
      const participant = useParticipantOption(id);
      return <ParticipantPicker {...participant} onChange={(o) => setId(o?.id ?? '')} />;
    }
    get.mockResolvedValue({
      items: [
        { id: ID, participantNumber: 'P-0001', person: { firstName: 'Ada', lastName: 'Lovelace' } },
      ],
      total: 1,
      page: 1,
      pageSize: 8,
    });
    render(<Page />, { wrapper });

    await userEvent.type(screen.getByRole('textbox'), 'Ada');
    const hit = await screen.findByRole('button', { name: /Ada Lovelace/ });
    get.mockClear();
    await userEvent.click(hit);

    // The name is already on screen, so a round trip to fetch it back would only
    // flash "Loading…" over it — or "Couldn't load" if that request failed.
    expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});
