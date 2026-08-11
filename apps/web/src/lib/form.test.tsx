import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebounced, todayInput } from './form';

/**
 * `useDebounced` is what stops a search box issuing a request per keystroke. It
 * had 35 callers and the highest-traffic one — the global search in the top bar —
 * was not among them, so the coalescing is worth pinning.
 */
function Typer({ text }: { text: string[] }) {
  const [value, setValue] = useState('');
  const debounced = useDebounced(value);
  return (
    <div>
      <button type="button" onClick={() => text.forEach((t) => setValue(t))}>
        type
      </button>
      <p data-testid="live">{value}</p>
      <p data-testid="debounced">{debounced}</p>
    </div>
  );
}

describe('useDebounced', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reports only the last value in a burst', () => {
    render(<Typer text={['C', 'Ca', 'Cas', 'Cast']} />);
    act(() => {
      screen.getByRole('button', { name: 'type' }).click();
    });
    expect(screen.getByTestId('live').textContent).toBe('Cast');
    // Nothing has settled yet — this is the window that used to fire 4 requests.
    expect(screen.getByTestId('debounced').textContent).toBe('');

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId('debounced').textContent).toBe('Cast');
  });

  it('does not settle early', () => {
    render(<Typer text={['a']} />);
    act(() => {
      screen.getByRole('button', { name: 'type' }).click();
    });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(screen.getByTestId('debounced').textContent).toBe('');
  });
});

describe('todayInput', () => {
  it('uses the local calendar date, not UTC', () => {
    // The bug this replaced: toISOString() rolled to tomorrow after 8pm Eastern,
    // so a date input defaulted to the wrong day for a whole evening.
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`;
    expect(todayInput()).toBe(expected);
  });
});
