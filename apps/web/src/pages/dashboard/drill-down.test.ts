import { describe, expect, it } from 'vitest';
import { buildDrillTo } from './DashboardPage';

/**
 * The audit's finding: all 22 dashboard drill-downs navigated to a BARE path, so
 * setting a chapter and opening a card silently showed the whole org — the
 * number you clicked and the list you landed on disagreed, with nothing saying
 * why.
 *
 * What makes this worth a test rather than a glance is that the destinations do
 * not agree with each other: housing namespaces its chapter key because two
 * lists share that route, only donations has a date range, and two targets can
 * receive nothing at all. Each of those is a silent wrong answer if it drifts.
 */

const FILTERS = { from: '2026-01-01', to: '2026-03-31', state: 'GA' };
const drill = buildDrillTo(FILTERS);

describe('dashboard drill-downs', () => {
  it('carries the chapter to a destination that has one', () => {
    expect(drill('/participants')).toBe('/participants?state=GA');
  });

  it('sends housing to the tab where its filter is real', () => {
    // Two failures live here. Housing mounts two lists and namespaces both, so a
    // bare ?state= is ignored by each; and the route lands on the OCCUPANCY tab,
    // where the homes list is not mounted at all — measured, the page fetched
    // /transitional-homes/occupancy and listed every chapter's homes while
    // homes.state=GA sat in the URL looking applied.
    const url = drill('/housing');
    expect(url).toContain('homes.state=GA');
    expect(url).toContain('tab=homes');
  });

  it('does not force housing onto a tab when nothing is being filtered', () => {
    // An unfiltered click should land on the section's normal default view.
    expect(buildDrillTo({ from: '', to: '', state: '' })('/housing')).toBe('/housing');
  });

  it('carries the date range only where the destination has one', () => {
    const donations = drill('/donors/donations');
    expect(donations).toContain('state=GA');
    expect(donations).toContain('from=2026-01-01');
    expect(donations).toContain('to=2026-03-31');
    // Participants has no date filter; the range must not appear.
    expect(drill('/participants')).not.toContain('from=');
  });

  it('leaves a destination alone when it has nothing to receive', () => {
    expect(drill('/intake')).toBe('/intake');
    expect(drill('/case-management')).toBe('/case-management');
  });

  it('lets a sub-path inherit its section', () => {
    // Links like /vehicles/alerts and /case-management/requests are not listed
    // individually; they take their section's entry.
    expect(drill('/vehicles/alerts')).toBe('/vehicles/alerts?state=GA');
    expect(drill('/case-management/requests')).toBe('/case-management/requests');
  });

  it('adds nothing at all when no filters are set', () => {
    const unfiltered = buildDrillTo({ from: '', to: '', state: '' });
    expect(unfiltered('/participants')).toBe('/participants');
    expect(unfiltered('/donors/donations')).toBe('/donors/donations');
  });

  it('never carries participantStatus, which cannot be mapped honestly', () => {
    // It is the deduplicated union of the inside and outside domains, while the
    // participants list keeps insideStatus and outsideStatus apart — a value in
    // both domains cannot be assigned to one without guessing.
    expect(drill('/participants')).not.toContain('participantStatus');
    expect(drill('/participants')).not.toContain('insideStatus');
  });

  it('does not invent a destination it has never heard of', () => {
    expect(drill('/somewhere-new')).toBe('/somewhere-new');
  });
});
