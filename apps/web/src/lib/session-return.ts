/**
 * Where to send someone after an expired session interrupted them.
 *
 * The 401 handler in lib/api.ts records the path before its hard redirect to
 * /login, so signing in again returns the user to the record they were reading
 * instead of dumping them on the Dashboard with no explanation.
 *
 * Both values are consumed (read once, then cleared) so a later, deliberate visit
 * to /login does not resurrect a stale destination or a stale "you timed out"
 * banner.
 *
 * Read at the point that USES them, and only once:
 * - App consumes the path, because App owns the `/login` -> `/` redirect. Its
 *   redirect fires the moment `user` appears and wins any imperative navigate()
 *   from the login form, so the path has to be here rather than there.
 * - LoginPage consumes the reason, because it renders the banner.
 */

const RETURN_KEY = 'jumpstart.returnTo';
const REASON_KEY = 'jumpstart.signedOutReason';

function take(key: string): string | null {
  try {
    const value = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    return value;
  } catch {
    // Private mode or a full quota: fall back to the default.
    return null;
  }
}

/**
 * Both getters are MEMOISED, and that is not an optimisation.
 *
 * Reading clears the stored value, which makes these calls impure — and React
 * StrictMode deliberately double-invokes render bodies and useState initialisers
 * in development to surface exactly that. The first call consumed the path, the
 * second found an empty slot and returned '/', and the redirect landed on the
 * Dashboard. Caching the first answer makes repeat calls idempotent, so it no
 * longer matters how many times React renders.
 */
let cachedReturnTo: string | undefined;
let cachedReason: string | null | undefined;

/** The interrupted path, or '/' when there wasn't one. */
export function postLoginTarget(): string {
  if (cachedReturnTo === undefined) {
    const value = take(RETURN_KEY);
    // In-app absolute paths only — never '//host' or a full URL. This value ends
    // up in a redirect and it arrives from storage.
    cachedReturnTo = !value || !value.startsWith('/') || value.startsWith('//') ? '/' : value;
  }
  return cachedReturnTo;
}

/** Why the user is looking at a login screen, if we know. */
export function signedOutReason(): string | null {
  if (cachedReason === undefined) cachedReason = take(REASON_KEY);
  return cachedReason;
}
