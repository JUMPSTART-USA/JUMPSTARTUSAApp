import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Meter } from './meter';
import { EmptyState, NoAccess, RedactedValue } from './spinner';

/**
 * Three components exist to keep three pairs of things apart. Each pair rendered
 * identically before, and in an app holding records about justice-involved
 * people, each collapse is a reader drawing a false conclusion about a person:
 *
 *   "you may not see this"      vs  "there is nothing here"
 *   "this value is withheld"    vs  "this value is absent"
 *   "the home is over capacity" vs  "the campaign hit its goal"
 *
 * So these tests assert DIFFERENCE, not appearance. A test that pinned the exact
 * classes would pass while someone quietly made the two look the same.
 */

describe('NoAccess is not an EmptyState', () => {
  /**
   * Nine screens reported a denial through EmptyState, so "No access to case
   * management" arrived in the same dashed box as "No case notes recorded" — a
   * case manager reads an empty file and concludes the participant has none.
   * Mutation: render NoAccess as an EmptyState and every assertion here fails.
   */
  it('reads as a wall rather than a gap', () => {
    const denial = render(<NoAccess reason="Requires the audit.read permission." />);
    const wall = denial.container.firstElementChild as HTMLElement;
    const empty = render(<EmptyState title="No entries" hint="Nothing recorded yet" />);
    const gap = empty.container.firstElementChild as HTMLElement;

    // The three differences, each too quiet on its own to carry the distinction.
    expect(wall.className).not.toContain('border-dashed');
    expect(gap.className).toContain('border-dashed');
    expect(wall.className).not.toBe(gap.className);
    expect(wall.querySelector('svg')).not.toBeNull();
    expect(gap.querySelector('svg')).toBeNull();
  });

  it('says what would grant access, because that is the reader s next move', () => {
    render(<NoAccess reason="Requires the admin.users permission." />);
    expect(screen.getByText('No access')).toBeTruthy();
    expect(screen.getByText('Requires the admin.users permission.')).toBeTruthy();
  });
});

describe('RedactedValue is not a missing value', () => {
  /**
   * It renders an em dash like a hundred other cells. Mutation: replace it with
   * a bare '—' and the screen-reader text and the tooltip both vanish.
   */
  it('tells a screen reader the value is withheld, not absent', () => {
    render(<RedactedValue requires="justice-history access" />);
    expect(screen.getByText('Hidden — requires justice-history access')).toBeTruthy();
  });

  it('keeps the dash visible but out of the accessible name', () => {
    const { container } = render(<RedactedValue requires="justice-history access" />);
    const dash = [...container.querySelectorAll('span')].find((s) => s.textContent === '—');
    expect(dash).toBeTruthy();
    expect(dash?.getAttribute('aria-hidden')).toBe('true');
  });
});

/** The coloured bar inside the muted track. */
const fill = (container: HTMLElement): HTMLElement => {
  const el = container.firstElementChild?.firstElementChild;
  if (!el) throw new Error('Meter rendered no fill');
  return el as HTMLElement;
};

describe('Meter has no opinion about what a full bar means', () => {
  /**
   * A fundraising bar at 100% has hit its goal; an occupancy bar at 100% has
   * filled the last bed in a transitional home. Mutation: add any `pct >= 100`
   * rule inside Meter — the first test fails, because the component would have
   * to override a tone it was handed.
   */
  it.each([
    ['success', 'bg-success'],
    ['warning', 'bg-warning'],
    ['destructive', 'bg-destructive'],
    ['primary', 'bg-primary'],
  ] as const)('paints a full bar %s when told to', (tone, expected) => {
    const { container } = render(<Meter pct={100} tone={tone} />);
    expect(fill(container).className).toContain(expected);
  });

  it('clamps out of range values so a caller cannot overflow the track', () => {
    const over = render(<Meter pct={140} tone="destructive" />);
    expect(fill(over.container).style.width).toBe('100%');
    const under = render(<Meter pct={-20} tone="success" />);
    expect(fill(under.container).style.width).toBe('0%');
  });
});
