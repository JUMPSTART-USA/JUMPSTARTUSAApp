import { useSyncExternalStore } from 'react';
import { getAnnouncement, subscribeToAnnouncements } from '@/lib/announce';

/**
 * Renders whatever `announce()` last said, for assistive tech only.
 *
 * Mounted once, above the routes, so it covers BOTH trees — the authenticated
 * app and the public participant portal, which submits requests of its own and
 * sits outside AppLayout entirely.
 *
 * Separate from AppLayout's route-change region on purpose: that one says where
 * you ARE, this one says what just HAPPENED, and merging them would mean a save
 * overwriting a navigation announcement mid-sentence.
 */
export function LiveAnnouncer() {
  const { message, seq } = useSyncExternalStore(
    subscribeToAnnouncements,
    getAnnouncement,
    getAnnouncement,
  );
  return (
    <div aria-live="polite" aria-atomic="true" role="status" className="sr-only">
      {/* The zero-width space makes a repeated message a real text change — see
          lib/announce.ts. Screen readers do not voice it. */}
      {message ? `${message}${seq % 2 ? '​' : ''}` : ''}
    </div>
  );
}
