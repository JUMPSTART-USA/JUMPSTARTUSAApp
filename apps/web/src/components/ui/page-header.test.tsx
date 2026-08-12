import { render, screen, waitFor } from '@testing-library/react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { PageHeader, useCurrentPageTitle } from './page-header';

/**
 * AppLayout announces route changes to screen readers, and it used to get the
 * name by reading `document.title` when the pathname changed. That worked only
 * while every route was statically imported: effects run child-first, so the
 * destination's PageHeader had already run by then.
 *
 * The module routes are lazy now. Measured in a real browser against the old
 * code: clicking Volunteers from the dashboard announced "Dashboard" — the page
 * just left — and never corrected itself.
 *
 * The fix is not that the signal goes blank while a page loads; it does not, and
 * could not usefully. It is that AppLayout announces when the title CHANGES
 * instead of when the URL does, so a suspended navigation stays silent until the
 * real name arrives. These pin that sequence.
 */

/** Stands in for AppLayout's live region: records every announcement it makes. */
function Announcer({ log }: { log: string[] }) {
  const title = useCurrentPageTitle();
  useEffect(() => {
    if (title) log.push(title);
  }, [title]);
  return <p data-testid="announced">{title}</p>;
}

describe('the current-page title signal', () => {
  it('publishes the heading a PageHeader renders', async () => {
    render(
      <>
        <Announcer log={[]} />
        <PageHeader title="Volunteers" />
      </>,
    );
    await waitFor(() => expect(screen.getByTestId('announced').textContent).toBe('Volunteers'));
  });

  it('prefers documentTitle when the heading is too long to read well', async () => {
    render(
      <>
        <Announcer log={[]} />
        <PageHeader title="Ada Lovelace · P-0001 · Inside" documentTitle="Ada Lovelace" />
      </>,
    );
    await waitFor(() => expect(screen.getByTestId('announced').textContent).toBe('Ada Lovelace'));
    expect(document.title).toBe('Ada Lovelace · JUMPSTART USA');
  });

  it('stays silent through a suspended navigation, then announces the destination', async () => {
    let resolveChunk: () => void = () => {};
    const chunk = new Promise<void>((resolve) => {
      resolveChunk = resolve;
    });
    const LazyPage = lazy(async () => {
      await chunk;
      return { default: () => <PageHeader title="Volunteers" /> };
    });

    function Route() {
      const [navigated, setNavigated] = useState(false);
      return (
        <>
          {navigated ? (
            <Suspense fallback={<p>Loading page…</p>}>
              <LazyPage />
            </Suspense>
          ) : (
            <PageHeader title="Dashboard" />
          )}
          <button type="button" onClick={() => setNavigated(true)}>
            go
          </button>
        </>
      );
    }

    const log: string[] = [];
    render(
      <>
        <Announcer log={log} />
        <Route />
      </>,
    );
    await waitFor(() => expect(screen.getByTestId('announced').textContent).toBe('Dashboard'));
    // The signal is a module singleton — one page is current at a time — so it
    // carries whatever an earlier test left. Start counting from the navigation
    // under test rather than from an assumed-empty store.
    log.length = 0;

    screen.getByRole('button', { name: 'go' }).click();
    await waitFor(() => expect(screen.getByText('Loading page…')).toBeTruthy());

    // The regression, precisely: here the OLD code read document.title and
    // announced "Dashboard" for a screen the user had already left. Nothing may
    // be announced until the destination exists.
    expect(log).toEqual([]);

    resolveChunk();
    await waitFor(() => expect(log).toEqual(['Volunteers']));
  });

  it('announces again on every later page', async () => {
    function Pages() {
      const [page, setPage] = useState('Volunteers');
      return (
        <>
          <PageHeader title={page} />
          <button type="button" onClick={() => setPage('Donors')}>
            go
          </button>
        </>
      );
    }
    const log: string[] = [];
    render(
      <>
        <Announcer log={log} />
        <Pages />
      </>,
    );
    await waitFor(() => expect(screen.getByTestId('announced').textContent).toBe('Volunteers'));
    log.length = 0;

    screen.getByRole('button', { name: 'go' }).click();
    await waitFor(() => expect(log).toEqual(['Donors']));
  });
});
