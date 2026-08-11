import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

/**
 * Two router behaviours that bit this app and will bite it again when list state
 * moves into the URL. They are pinned here against react-router itself, not
 * against one screen, because the failure is in how the API is used and it was
 * copied from the same wrong shape in more than one place.
 *
 * 1. `setSearchParams(object)` REPLACES the entire query string.
 * 2. `setSearchParams` navigates with no `state`, so it discards location.state
 *    — which BackLink reads for its "← Dashboard" label.
 */

function Probe({ mode }: { mode: 'replaceAll' | 'merge' }) {
  const [params, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const switchTab = () => {
    if (mode === 'replaceAll') {
      setSearchParams({ tab: 'case' }, { replace: true });
      return;
    }
    const next = new URLSearchParams(params);
    next.set('tab', 'case');
    const search = next.toString();
    navigate({ search: search ? `?${search}` : '' }, { replace: true, state: location.state });
  };

  return (
    <div>
      <button type="button" onClick={switchTab}>
        switch
      </button>
      <p data-testid="search">{location.search}</p>
      <p data-testid="back">{(location.state as { back?: { label: string } } | null)?.back?.label ?? 'NONE'}</p>
    </div>
  );
}

function mount(mode: 'replaceAll' | 'merge') {
  return render(
    <MemoryRouter
      initialEntries={[
        { pathname: '/participants/abc', search: '?page=3&q=smith', state: { back: { label: 'Dashboard' } } },
      ]}
    >
      <Probe mode={mode} />
    </MemoryRouter>,
  );
}

describe('setSearchParams pitfalls', () => {
  it('the object form destroys sibling params and the router back-state', () => {
    mount('replaceAll');
    expect(screen.getByTestId('search').textContent).toBe('?page=3&q=smith');
    expect(screen.getByTestId('back').textContent).toBe('Dashboard');

    act(() => {
      screen.getByRole('button', { name: 'switch' }).click();
    });

    // This is what ParticipantProfilePage did: page and q are gone…
    expect(screen.getByTestId('search').textContent).toBe('?tab=case');
    // …and so is the state BackLink needs, so the breadcrumb degrades.
    expect(screen.getByTestId('back').textContent).toBe('NONE');
  });

  it('merging from the current params, and passing state, keeps both', () => {
    mount('merge');
    act(() => {
      screen.getByRole('button', { name: 'switch' }).click();
    });

    const search = screen.getByTestId('search').textContent ?? '';
    expect(new URLSearchParams(search).get('page')).toBe('3');
    expect(new URLSearchParams(search).get('q')).toBe('smith');
    expect(new URLSearchParams(search).get('tab')).toBe('case');
    expect(screen.getByTestId('back').textContent).toBe('Dashboard');
  });
});
