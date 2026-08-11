import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * The behaviour these cover is the reason the boundary exists at all, and none of
 * it is visible to tsc: that a chunk failure is treated as "a new build is live"
 * and reloads, that unsaved work vetoes that reload, that the reload is one-shot,
 * and — the one a hand-rolled boundary almost always gets wrong — that it lets go
 * of the error when the user navigates away.
 */

const chunkError = () => {
  const e = new Error('Failed to fetch dynamically imported module: /assets/x-a1b2.js');
  return e;
};

function Boom({ error }: { error: Error }): never {
  throw error;
}

let reload: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionStorage.clear();
  reload = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  });
  // The boundary logs the stack on purpose; keep the test output readable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <MemoryRouter>
        <ErrorBoundary>
          <p>content</p>
        </ErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByText('content')).toBeTruthy();
  });

  it('shows a message instead of a blank screen when a render throws', () => {
    render(
      <MemoryRouter>
        <ErrorBoundary>
          <Boom error={new Error('kaboom')} />
        </ErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByText('kaboom')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    // A plain render error is not a stale build, so it must NOT auto-reload.
    expect(reload).not.toHaveBeenCalled();
  });

  it('treats a failed chunk import as a new deploy and reloads once', () => {
    render(
      <MemoryRouter>
        <ErrorBoundary>
          <Boom error={chunkError()} />
        </ErrorBoundary>
      </MemoryRouter>,
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('jumpstart.chunkReloadAttempted')).toBe('1');
  });

  it('does not reload a second time in the same tab session', () => {
    sessionStorage.setItem('jumpstart.chunkReloadAttempted', '1');
    render(
      <MemoryRouter>
        <ErrorBoundary>
          <Boom error={chunkError()} />
        </ErrorBoundary>
      </MemoryRouter>,
    );
    // A deploy that is genuinely broken must land on a message, not a reload loop.
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
  });

  it('clears the one-shot guard once a healthy screen mounts', () => {
    sessionStorage.setItem('jumpstart.chunkReloadAttempted', '1');
    render(
      <MemoryRouter>
        <ErrorBoundary>
          <p>healthy</p>
        </ErrorBoundary>
      </MemoryRouter>,
    );
    // Otherwise the SECOND deploy in a long-lived tab gets the error screen.
    expect(sessionStorage.getItem('jumpstart.chunkReloadAttempted')).toBeNull();
  });

  it('recovers on navigation instead of latching the error forever', async () => {
    function Nav() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate('/ok')}>
          go
        </button>
      );
    }
    render(
      <MemoryRouter initialEntries={['/bad']}>
        <Nav />
        <ErrorBoundary>
          <Routes>
            <Route path="/bad" element={<Boom error={new Error('kaboom')} />} />
            <Route path="/ok" element={<p>recovered</p>} />
          </Routes>
        </ErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByText('kaboom')).toBeTruthy();

    screen.getByRole('button', { name: 'go' }).click();

    // Without the resetKey the URL changes while the content column stays dead.
    expect(await screen.findByText('recovered')).toBeTruthy();
  });
});
