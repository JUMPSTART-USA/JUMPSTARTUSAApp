import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { endOfMonthInput, useDebounced, todayInput } from './form';

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

describe('endOfMonthInput', () => {
  /**
   * This is an upper bound sent to an API param that runs through
   * z.coerce.date(). A naive `${month}-31` does not fail on '2026-02-31' — it
   * coerces forward to March 3 — so February's hours total would quietly absorb
   * the first days of March. Every month length is worth pinning.
   */
  it.each([
    ['2026-01', '2026-01-31'],
    ['2026-02', '2026-02-28'],
    ['2024-02', '2024-02-29'], // leap year
    ['2026-04', '2026-04-30'],
    ['2026-12', '2026-12-31'],
  ])('%s ends on %s', (month, expected) => {
    expect(endOfMonthInput(month)).toBe(expected);
  });

  it('never returns a day that does not exist in the month', () => {
    for (let m = 1; m <= 12; m++) {
      const month = `2026-${String(m).padStart(2, '0')}`;
      const day = Number(endOfMonthInput(month).slice(-2));
      // A real calendar day: re-reading it must land in the same month.
      expect(new Date(2026, m - 1, day).getMonth()).toBe(m - 1);
    }
  });

  it('rejects a malformed month rather than inventing a date', () => {
    expect(() => endOfMonthInput('2026-13')).toThrow();
    expect(() => endOfMonthInput('2026')).toThrow();
    expect(() => endOfMonthInput('2026-06-15')).toThrow();
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
