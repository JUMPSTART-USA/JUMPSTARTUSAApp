/**
 * One polite live region for the whole app, and the store behind it.
 *
 * The audit's finding was that nothing the app does is ever announced: 101
 * mutations complete in silence. A sighted user infers success from the dialog
 * closing and the row appearing; a screen-reader user gets nothing at all, and
 * cannot tell a save that worked from one that quietly did nothing.
 *
 * Deliberately NOT a toast system. A visible notification layer is a real design
 * decision — placement, stacking, dismissal, how it behaves next to the existing
 * Notice component — and inventing one here would be a bigger change than the
 * gap being closed. This is the announcement, nothing else.
 *
 * The same subscribe/publish shape as the page-title signal in page-header.tsx:
 * a module-level store, because the publisher is the API client (lib/api.ts),
 * which is not a component and cannot hold React state.
 */

interface Announcement {
  message: string;
  /**
   * A live region only announces when its TEXT CHANGES, so saving twice in a row
   * would be announced once — the second "Saved" is the same string. This
   * counter makes every announcement a distinct render; the component turns odd
   * values into a trailing zero-width space, which screen readers ignore but the
   * DOM sees as a change.
   */
  seq: number;
}

let current: Announcement = { message: '', seq: 0 };
const listeners = new Set<() => void>();

/** Say something to assistive tech. Politely — it waits for a pause in speech. */
export function announce(message: string): void {
  if (!message) return;
  current = { message, seq: current.seq + 1 };
  for (const listener of listeners) listener();
}

export function subscribeToAnnouncements(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getAnnouncement(): Announcement {
  return current;
}
