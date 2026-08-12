import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EntityPicker, useRehydratedValue, type PickerOption } from './entity-picker';

/**
 * The picker filters were kept OUT of the URL until this existed, because a URL
 * can only carry an id: a restored link showed a correctly filtered list beside
 * an EMPTY SEARCH BOX, which reads as a bug — three of four hundred records on
 * screen and no visible reason why.
 *
 * These pin the four things that fixes it, none of which tsc can see:
 * the box is never empty while an id is in play; a name that resolves is shown;
 * one that cannot be resolved says exactly that, once, without naming a cause;
 * and a request that merely FAILED never gets reported as a permission answer.
 */

const ADA: PickerOption = { id: 'a1', label: 'Ada Lovelace', sublabel: 'P-0001' };

/** Never resolves — the loading state as a user experiences it, not a mock. */
const pending = () => new Promise<PickerOption | null>(() => {});

function Harness({
  id,
  resolve,
  onChange = vi.fn(),
}: {
  id: string;
  resolve: (id: string) => Promise<PickerOption | null>;
  onChange?: (option: PickerOption | null) => void;
}) {
  const rehydrated = useRehydratedValue('test', id, resolve);
  return (
    <EntityPicker
      {...rehydrated}
      onChange={onChange}
      queryKey="test"
      placeholder="Search people…"
      search={async () => []}
    />
  );
}

function mount(ui: React.ReactElement) {
  const client = new QueryClient({
    // A retrying failure would take the 'failed' assertion into a timeout
    // instead of a result.
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const searchBox = () => screen.queryByPlaceholderText('Search people…');

describe('EntityPicker rehydration', () => {
  it('shows no filter chip at all when there is no id', () => {
    mount(<Harness id="" resolve={pending} />);
    expect(searchBox()).toBeTruthy();
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('resolves an id to its name', async () => {
    mount(<Harness id="a1" resolve={async () => ADA} />);
    expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText(/P-0001/)).toBeTruthy();
    expect(searchBox()).toBeNull();
  });

  it('holds the chip while resolving, rather than sitting empty', () => {
    mount(<Harness id="a1" resolve={pending} />);
    // The whole point: a filtered list must never appear beside a search box
    // that looks like nothing is selected.
    expect(searchBox()).toBeNull();
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('says one thing, and nothing about the cause, when the id resolves to nothing', async () => {
    mount(<Harness id="a1" resolve={async () => null} />);
    expect(await screen.findByText("A record you can't view")).toBeTruthy();
    // Naming the cause — another chapter, deleted, renamed — would make the
    // chip an existence oracle for records outside the viewer's chapter (§7.2).
    expect(screen.queryByText(/chapter|deleted|permission/i)).toBeNull();
    expect(searchBox()).toBeNull();
  });

  it('reports a failed lookup as a failure, not as a record you cannot view', async () => {
    const resolve = vi.fn(async () => {
      throw new Error('network');
    });
    mount(<Harness id="a1" resolve={resolve} />);

    expect(await screen.findByText("Couldn't load")).toBeTruthy();
    // The Phase 1 lesson, restated: a request that did not complete must never
    // render as a negative answer about the record.
    expect(screen.queryByText("A record you can't view")).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(resolve).toHaveBeenCalledTimes(2));
  });

  it('clears to null so the caller can drop the id from the URL', async () => {
    const onChange = vi.fn();
    mount(<Harness id="a1" resolve={async () => ADA} onChange={onChange} />);
    await screen.findByText('Ada Lovelace');

    await userEvent.click(screen.getByRole('button', { name: /Change/ }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('offers the escape hatch even for a value it could not resolve', async () => {
    const onChange = vi.fn();
    mount(<Harness id="a1" resolve={async () => null} onChange={onChange} />);
    await screen.findByText("A record you can't view");

    // Without this the filter is unreachable: no name to recognise, and no way
    // to clear it short of hand-editing the URL.
    await userEvent.click(screen.getByRole('button', { name: /Change/ }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('does not look the id up until there is one', () => {
    const resolve = vi.fn(pending);
    mount(<Harness id="" resolve={resolve} />);
    expect(resolve).not.toHaveBeenCalled();
  });
});
