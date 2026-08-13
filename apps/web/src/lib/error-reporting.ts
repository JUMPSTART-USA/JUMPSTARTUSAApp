/**
 * Report client-side errors to our own API.
 *
 * The audit's finding: the app has no client error reporting at all, which is
 * why a dropdown bug needed four rounds and a hand-measured window size to pin
 * down. Nothing the browser did was ever visible from the server, so every
 * report started as "it broke" and ended with someone guessing at viewports.
 *
 * Reports go to /client-errors — our API, inside Azure, not a third party. Stack
 * traces and routes carry enough shape to identify a screen, and this app's
 * screens are participants' records.
 */

/** Compiled in by vite (see vite.config.ts); also declared in build-version.ts. */
declare const __BUILD_ID__: string;

/** Anything that looks like a record id becomes a placeholder. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const LONG_NUMBER = /\b\d{4,}\b/g;

/**
 * Turn a live pathname into a route PATTERN.
 *
 * `/participants/3f2504e0-…/timeline` becomes `/participants/:id/timeline`. This
 * is the whole reason the table can be described as PII-free: the id in that URL
 * identifies a person, and a log full of them is a log that cannot be shared
 * with whoever is debugging.
 *
 * The query string is dropped entirely rather than redacted. It now carries
 * every list filter in the app — searches, chapters, participant ids — and there
 * is no version of "keep some of it" that stays safe as filters are added.
 */
export function routePattern(pathname: string): string {
  return pathname.replace(UUID, ':id').replace(LONG_NUMBER, ':n') || '/';
}

interface Report {
  message: string;
  stack?: string;
  route: string;
  source: 'boundary' | 'window' | 'promise';
  buildId: string;
  viewportW?: number;
  viewportH?: number;
  userAgent?: string;
}

/**
 * Fingerprints already sent by THIS page. The server also collapses repeats, but
 * a render loop can throw hundreds of times a second and there is no reason to
 * spend the user's bandwidth proving it. Cleared on navigation only by reload.
 */
const sentThisSession = new Set<string>();
const MAX_PER_SESSION = 20;

export function buildReport(
  error: unknown,
  source: Report['source'],
  location: { pathname: string } = window.location,
): Report {
  const message =
    error instanceof Error
      ? error.message || error.name
      : typeof error === 'string'
        ? error
        : 'Unknown error';
  return {
    // Redact the message too: "Failed to load /participants/<uuid>" is a common
    // shape, and it would put the id straight back in.
    message: message.replace(UUID, ':id').slice(0, 500),
    stack: error instanceof Error && error.stack ? error.stack.replace(UUID, ':id') : undefined,
    route: routePattern(location.pathname),
    source,
    buildId: __BUILD_ID__,
    viewportW: window.innerWidth || undefined,
    viewportH: window.innerHeight || undefined,
    userAgent: navigator.userAgent,
  };
}

/**
 * Send one report, at most once per fingerprint per page.
 *
 * Deliberately fire-and-forget and deliberately silent on failure: an error
 * reporter that throws, retries, or logs its own failure turns one broken screen
 * into a loop. `keepalive` so a report survives the navigation that a crash
 * often triggers.
 */
export function reportClientError(error: unknown, source: Report['source']): void {
  try {
    const report = buildReport(error, source);
    const fingerprint = `${report.message}|${report.route}`;
    if (sentThisSession.has(fingerprint) || sentThisSession.size >= MAX_PER_SESSION) return;
    sentThisSession.add(fingerprint);

    void fetch('/api/client-errors', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      keepalive: true,
    }).catch(() => {
      // Never surface a reporting failure — see above.
    });
  } catch {
    // Same: building a report must not be able to break the page it describes.
  }
}

/**
 * Catch what React cannot: errors thrown outside the component tree and promise
 * rejections nobody handled. The ErrorBoundary sees render errors only, which is
 * a minority of what actually breaks — event handlers, timers and async work all
 * bypass it entirely.
 */
export function installGlobalErrorReporting(): void {
  window.addEventListener('error', (event) => {
    reportClientError(event.error ?? event.message, 'window');
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportClientError(event.reason, 'promise');
  });
}
