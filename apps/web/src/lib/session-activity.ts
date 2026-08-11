import { SESSION_IDLE_TIMEOUT_MS, SESSION_WARN_BEFORE_MS } from '@jumpstart/shared';
import { useEffect, useState } from 'react';

/**
 * Warns before an idle session expires, and lets the user keep it.
 *
 * The API's session cookie is rolling, so the clock only resets when a REQUEST
 * goes out (app.setup.ts). Reading a record or filling in a form issues none —
 * an intake coordinator can spend 35 minutes on the 59-field participant create
 * page, press Create, and get a 401 that used to take the whole form with it.
 * Phase 3 made that recoverable (the path is remembered, the form warns before
 * unload); this makes it avoidable.
 *
 * Tracked from actual requests rather than mouse/keyboard activity, because
 * mouse movement does NOT extend the server's clock and counting it would
 * promise a session that has already gone.
 */

let lastRequestAt = Date.now();

/** Called by the API wrapper on every request — the same thing that resets the server's clock. */
export function noteApiActivity(): void {
  lastRequestAt = Date.now();
}

export function msUntilIdleExpiry(): number {
  return SESSION_IDLE_TIMEOUT_MS - (Date.now() - lastRequestAt);
}

/**
 * Returns the seconds left when a session is close to expiring, otherwise null.
 * Polls rather than scheduling a single timeout: a laptop that slept through the
 * timeout would otherwise fire late and report a session that is already gone.
 */
export function useIdleExpiryWarning(enabled: boolean): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const remaining = msUntilIdleExpiry();
      setSecondsLeft(
        remaining <= SESSION_WARN_BEFORE_MS ? Math.max(0, Math.round(remaining / 1000)) : null,
      );
    };
    tick();
    const id = window.setInterval(tick, 15_000);
    // Coming back to the tab is the moment the answer most likely changed.
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [enabled]);

  return secondsLeft;
}
