import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildReport, reportClientError, routePattern } from './error-reporting';

/**
 * The app had no client error reporting, which is why a dropdown bug took four
 * rounds and a hand-measured window size to pin down.
 *
 * The reports it now sends describe SCREENS, and this app's screens are
 * participants' records — so the redaction here is not tidiness, it is the
 * reason a table of client errors can be read by whoever is debugging without
 * handing them a list of who was on which page. These tests pin that, plus the
 * two ways an error reporter can make things worse: throwing, and flooding.
 */

afterEach(() => vi.unstubAllGlobals());

describe('route redaction', () => {
  it('replaces a record id with a placeholder', () => {
    expect(routePattern('/participants/3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(
      '/participants/:id',
    );
  });

  it('redacts ids in the MIDDLE of a path, not just at the end', () => {
    expect(routePattern('/participants/3f2504e0-4f89-11d3-9a0c-0305e82c3301/timeline')).toBe(
      '/participants/:id/timeline',
    );
  });

  it('redacts every id when a path carries more than one', () => {
    const two = routePattern(
      '/housing/homes/3f2504e0-4f89-11d3-9a0c-0305e82c3301/residents/11111111-2222-3333-4444-555555555555',
    );
    expect(two).toBe('/housing/homes/:id/residents/:id');
    expect(two).not.toMatch(/[0-9a-f]{8}-/);
  });

  it('redacts long numeric ids too', () => {
    expect(routePattern('/invoices/20260813')).toBe('/invoices/:n');
  });

  it('leaves a plain route alone', () => {
    expect(routePattern('/case-management/notes')).toBe('/case-management/notes');
  });
});

describe('the report body', () => {
  it('never carries the query string, which now holds every list filter', () => {
    vi.stubGlobal('location', {
      pathname: '/participants',
      search: '?participantId=3f2504e0-4f89-11d3-9a0c-0305e82c3301&search=Oglesby',
    });
    const report = buildReport(new Error('boom'), 'boundary', {
      pathname: '/participants',
    });
    expect(JSON.stringify(report)).not.toContain('Oglesby');
    expect(JSON.stringify(report)).not.toContain('3f2504e0');
  });

  it('redacts an id embedded in the message', () => {
    // "Failed to fetch /participants/<uuid>" is a common shape and would put the
    // id straight back into a table whose whole point is not having any.
    const report = buildReport(
      new Error('Failed to load /participants/3f2504e0-4f89-11d3-9a0c-0305e82c3301'),
      'window',
      { pathname: '/participants' },
    );
    expect(report.message).toBe('Failed to load /participants/:id');
  });

  it('carries the viewport, which is what the last hard bug needed', () => {
    const report = buildReport(new Error('boom'), 'boundary', { pathname: '/' });
    expect(report.viewportW).toBeTypeOf('number');
    expect(report.viewportH).toBeTypeOf('number');
  });

  it('survives being handed something that is not an Error', () => {
    expect(buildReport('just a string', 'promise', { pathname: '/' }).message).toBe(
      'just a string',
    );
    expect(buildReport(undefined, 'promise', { pathname: '/' }).message).toBe('Unknown error');
  });
});

describe('sending', () => {
  it('sends once per fingerprint, however many times a loop throws', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    for (let i = 0; i < 50; i += 1) reportClientError(new Error('render loop'), 'boundary');

    // A render loop can throw hundreds of times a second; the user should not
    // pay for the proof.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never throws, even when fetch itself is broken', () => {
    vi.stubGlobal('fetch', () => {
      throw new Error('network stack is gone');
    });
    // An error reporter that throws turns one broken screen into two.
    expect(() => reportClientError(new Error('unique failure A'), 'window')).not.toThrow();
  });

  it('never rejects when the request fails in flight', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    expect(() => reportClientError(new Error('unique failure B'), 'window')).not.toThrow();
    await Promise.resolve();
  });
});

/**
 * The API REFUSES a report carrying a record id or an email address
 * (client-errors.controller.ts). That refusal is the guarantee; this scrubbing
 * is what stops a legitimate report being thrown away to satisfy it. If these
 * two ever disagree, error reporting silently stops working — the SPA ignores
 * a failed report by design.
 */
describe('reports carry nothing the API will refuse', () => {
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

  it('strips a record id from the message', () => {
    const report = buildReport(
      new Error('Failed to load participant 3f2504e0-4f89-11d3-9a0c-0305e82c3301'),
      'window',
      { pathname: '/participants' },
    );
    expect(report.message).not.toMatch(UUID);
    expect(report.message).toContain(':id');
  });

  it('strips an email address from the message', () => {
    const report = buildReport(new Error('Invite to mark@jumpstartusa.org failed'), 'window', {
      pathname: '/admin/users',
    });
    expect(report.message).not.toMatch(EMAIL);
    expect(report.message).toContain(':email');
  });

  it('strips both from the stack', () => {
    const error = new Error('boom');
    error.stack =
      'Error: boom\n  at load (/participants/3f2504e0-4f89-11d3-9a0c-0305e82c3301)\n' +
      '  at notify (mark@jumpstartusa.org)';
    const report = buildReport(error, 'boundary', { pathname: '/participants' });
    expect(report.stack).not.toMatch(UUID);
    expect(report.stack).not.toMatch(EMAIL);
  });

  it('truncates an oversized stack rather than letting the API reject it', () => {
    const error = new Error('boom');
    error.stack = `Error: boom\n${'  at somewhere (/very/long/path)\n'.repeat(500)}`;
    const report = buildReport(error, 'promise', { pathname: '/' });
    expect(error.stack.length).toBeGreaterThan(4_000);
    expect(report.stack!.length).toBeLessThanOrEqual(4_000);
  });
});
