import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { cardClickNav } from './card';
import { MetricCard, StatTile } from './stat';

/**
 * A previous adversarial pass ruled the naive KPI-tile consolidation unsafe and
 * named four constraints. These are those four, one describe block each: not
 * "does the component render", but "does the component still make the specific
 * mistake impossible". Each has a mutation noted beside it — break that, and the
 * test must fail, or the test is decoration.
 */

const router = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

/** The nth <p> StatTile emits: 0 label, 1 value, 2 the supporting line. */
const line = (container: HTMLElement, n: number): HTMLElement => {
  const el = container.querySelectorAll('p')[n];
  if (!el) throw new Error(`no <p> at index ${n}`);
  return el as HTMLElement;
};

describe('constraint 1 — a tile that must not be navigable cannot become navigable', () => {
  /**
   * The intake summary shows the Referrals count to anyone with
   * intake_queues.read, while the Referrals tab needs referral_inbox.read. The
   * count is authorized data and stays; what must never appear is a link to a
   * tab that will not render. Mutation: give this MetricCard a `to`.
   */
  it('renders no link and no tab stop without a destination', () => {
    const { container } = router(<MetricCard label="Referrals" value={7} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0);
    // The number is authorized data — inertness must not be achieved by hiding it.
    expect(screen.getByText('7')).toBeTruthy();
  });

  /**
   * The shape the dashboard used — role="link" tabIndex={0} on a div — satisfies
   * a getByRole('link') query while having no href, so the href is the assertion
   * that tells the two apart. Mutation: render the navigable branch as a div
   * with role="link" and this fails while a role-only query would pass.
   */
  it('renders a real anchor, not a div wearing role="link"', () => {
    router(<MetricCard label="In housing" value={12} to="/housing" />);
    const link = screen.getByRole('link');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/housing');
  });
});

describe('constraint 2 — a healthy zero is never coloured', () => {
  /**
   * "Overdue check-ins: 0" must not be amber. The component cannot see the
   * value, so it cannot decide: the caller passes a flag or does not. Mutation:
   * add any `value > 0` comparison inside StatTile — it fails the second test,
   * because it has no words of its own to put in the supporting line.
   */
  it.each([0, 3, -3])(
    'shows no tone and no supporting line for %d when the caller passes no flag',
    (value) => {
      const { container } = render(<StatTile label="Overdue check-ins" value={value} />);
      const rendered = line(container, 1);
      expect(rendered.className).not.toContain('text-warning');
      expect(rendered.className).not.toContain('text-destructive');
      expect(container.querySelectorAll('p')).toHaveLength(2);
    },
  );

  it('shows the tone and the words together when the caller does', () => {
    const { container } = render(
      <StatTile
        label="Overdue check-ins"
        value={3}
        flag={{ tone: 'warning', note: 'past their due date' }}
      />,
    );
    expect(line(container, 1).className).toContain('text-warning');
    expect(screen.getByText('past their due date')).toBeTruthy();
  });
});

describe('constraint 3 — colour follows the caller, not the number', () => {
  /**
   * Housing's "Available" is bad when NEGATIVE; every other metric that carries
   * a valence is bad when it grows. One threshold rule cannot serve both, so
   * there is no threshold rule. Mutation: add "negatives are bad" or "labels
   * containing 'overdue' warn" inside the component — each fails one of these.
   */
  it('colours a positive value when told to', () => {
    const { container } = render(
      <StatTile label="Available" value={5} flag={{ tone: 'destructive', note: '5 beds over' }} />,
    );
    expect(line(container, 1).className).toContain('text-destructive');
  });

  it('leaves a negative value alone when not told to', () => {
    const { container } = render(<StatTile label="Available" value={-5} />);
    expect(line(container, 1).className).not.toContain('text-destructive');
  });
});

describe('constraint 4 — the stack owns no surface and emits no heading', () => {
  /**
   * These sit inside Cards that already have a CardTitle, inside bordered
   * strips, on bare pages, and in dialog cells. Anything structural here is
   * wrong at one of them. Mutation: add a border, a padding or an h3 to
   * StatTile.
   */
  it('emits no heading, so nothing nests under a CardTitle', () => {
    const { container } = render(<StatTile label="Placements" value={4} />);
    expect(container.querySelector('h1,h2,h3,h4,h5,h6')).toBeNull();
  });

  it('paints no surface of its own', () => {
    const { container } = render(<StatTile label="Placements" value={4} />);
    const cls = (container.firstElementChild as HTMLElement).className;
    for (const banned of ['border', 'bg-', 'rounded', 'p-', 'text-center', 'text-left']) {
      expect(cls).not.toContain(banned);
    }
  });

  it('puts the label before the value, because a screen reader reads DOM order', () => {
    const { container } = render(<StatTile label="Placements" value={4} />);
    expect(line(container, 0).textContent).toBe('Placements');
    expect(line(container, 1).textContent).toBe('4');
  });
});

describe('the accessible name is everything the tile says', () => {
  /**
   * The dashboard's aria-label was `${label} — open`, which REPLACED the
   * contents: ten tiles whose accessible name never contained the number they
   * exist to communicate. Leaving the name to come from contents fixes that and
   * cannot drift. Mutation: add an aria-label to the anchor.
   */
  it('names the link with the label AND the value', () => {
    router(<MetricCard label="In housing" value={12} to="/housing" />);
    expect(screen.getByRole('link', { name: 'In housing 12' })).toBeTruthy();
  });

  it('carries a flags words into the name, so the state is not colour-only', () => {
    router(
      <MetricCard
        label="Overdue check-ins"
        value={3}
        to="/mentoring/checkins"
        flag={{ tone: 'warning', note: 'past their due date' }}
      />,
    );
    expect(
      screen.getByRole('link', { name: 'Overdue check-ins 3 past their due date' }),
    ).toBeTruthy();
  });
});

describe('cardClickNav — click-anywhere that does not fight the link inside it', () => {
  const ev = (over: Record<string, unknown>) =>
    ({
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      button: 0,
      target: { closest: () => null },
      ...over,
    }) as never;

  it('navigates on a plain click', () => {
    const go = vi.fn();
    cardClickNav(go)(ev({}));
    expect(go).toHaveBeenCalledOnce();
  });

  /** Otherwise cmd-click opens a new tab AND navigates the current one. */
  it('stands aside for a modified click', () => {
    const go = vi.fn();
    cardClickNav(go)(ev({ metaKey: true }));
    cardClickNav(go)(ev({ button: 1 }));
    expect(go).not.toHaveBeenCalled();
  });

  /** Otherwise a click on the title fires the handler on top of the anchor. */
  it('stands aside for a click that started on a link or control', () => {
    const go = vi.fn();
    cardClickNav(go)(ev({ target: { closest: () => document.createElement('a') } }));
    expect(go).not.toHaveBeenCalled();
  });
});
