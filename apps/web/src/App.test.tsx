import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

/**
 * Who has to wait for `GET /auth/me`, and who must not.
 *
 * The app used to gate EVERYTHING on the session check — `if (isLoading) return
 * <PageLoader />` above the router. A participant opening a texted portal link
 * therefore watched a spinner until a request that, for them, can only ever fail
 * came back 401. They are the one group with no session and no way to get one.
 *
 * The other half is just as important and easy to break while fixing the first:
 * an authenticated user opening a deep link must NOT be bounced to /login just
 * because the check has not resolved yet.
 */

const auth = vi.hoisted(() => ({ state: { user: null as unknown, isLoading: true } }));
vi.mock('@/lib/auth', () => ({
  useAuth: () => auth.state,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/lib/build-version', () => ({ useBuildVersionWatch: () => {} }));
// Stubbed so this tests App's gating, not the portal's own fetching.
vi.mock('@/pages/portal', () => ({ PortalPage: () => <p>portal content</p> }));
vi.mock('@/pages/LoginPage', () => ({ LoginPage: () => <p>login form</p> }));

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

beforeEach(() => {
  auth.state = { user: null, isLoading: true };
});

describe('the session-check gate', () => {
  it('paints the portal while the session check is still in flight', async () => {
    at('/portal/some-token');
    // No await on purpose: this must be true on the FIRST render, not eventually.
    expect(screen.getByText('portal content')).toBeTruthy();
    expect(screen.queryByText('Loading your account…')).toBeNull();
  });

  it('paints the login form while the session check is still in flight', () => {
    at('/login');
    expect(screen.getByText('login form')).toBeTruthy();
  });

  it('does NOT bounce a deep link to /login before the check resolves', async () => {
    at('/participants/abc');
    // Redirecting here would throw an authenticated user out of the record they
    // just opened, which is the failure this gate exists to avoid.
    expect(screen.queryByText('login form')).toBeNull();
    // Two live regions exist here — the announcer and the loader — so match on
    // the text rather than assuming which one `getByRole` returns.
    await waitFor(() => expect(screen.getByText('Loading your account…')).toBeTruthy());
  });

  it('sends an anonymous visitor to /login once the check says so', async () => {
    auth.state = { user: null, isLoading: false };
    at('/participants/abc');
    await waitFor(() => expect(screen.getByText('login form')).toBeTruthy());
  });
});
