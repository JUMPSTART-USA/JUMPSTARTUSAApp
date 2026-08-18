import { render, screen } from '@testing-library/react';
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
  useNavigate,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary, RouteErrorElement } from './ErrorBoundary';

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

/**
 * The data router doorway.
 *
 * These exist because the app shipped for weeks with a router that had NO
 * errorElement: React Router then substitutes its own developer-facing screen
 * and catches route render errors BEFORE any React boundary above
 * RouterProvider can see them. Every test above passed throughout — they only
 * ever exercised the React boundary — while a real user meeting a new deploy
 * was shown "Hey developer 👋" and never reloaded. Seen on staging 2026-08-18.
 */
describe('RouteErrorElement (data router)', () => {
  function renderRoute(error: Error) {
    const router = createMemoryRouter(
      [{ path: '/', element: <Boom error={error} />, errorElement: <RouteErrorElement /> }],
      { initialEntries: ['/'] },
    );
    return render(<RouterProvider router={router} />);
  }

  it('shows our screen, never React Router default developer message', () => {
    renderRoute(new Error('something broke'));
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy();
    // The tell-tale of the default element. If this ever appears, the route
    // lost its errorElement again.
    expect(document.body.textContent).not.toMatch(/Hey developer/i);
    expect(document.body.textContent).not.toMatch(/errorElement/i);
  });

  it('treats a chunk failure as a new deploy and reloads once', () => {
    renderRoute(chunkError());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload twice for the same tab', () => {
    renderRoute(chunkError());
    renderRoute(chunkError());
    // One-shot guard: a genuinely broken deploy must not reload forever.
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('explains the situation rather than showing a raw stack', () => {
    renderRoute(chunkError());
    expect(screen.getByText(/new version of the app was released/i)).toBeTruthy();
  });
});
