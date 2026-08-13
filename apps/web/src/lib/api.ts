/**
 * Typed fetch wrapper for the platform API. Session-cookie auth: every request
 * carries credentials; 401 anywhere bounces to the login screen.
 */

import { announce } from '@/lib/announce';
import { noteApiActivity } from '@/lib/session-activity';

/**
 * Requests that change something but are not a user's SAVE, and so must stay
 * silent. Everything else non-GET is announced — see announceWrite below.
 *
 * All three are POSTs shaped like questions rather than commands: the two
 * lookups return candidates for the user to review, and the auth family is
 * sign-in, sign-out and the admin view-as switch, each of which already has
 * loud feedback of its own (a redirect, a banner). Enumerated from every
 * mutating call in the app rather than guessed at.
 *
 * If you add another question-shaped POST, add it here — otherwise it will
 * announce "Saved" at a screen-reader user who only asked a question.
 */
const SILENT_WRITES = [/^\/auth\//, /\/duplicate-check$/, /\/person-merge\/preview$/];

/**
 * What to say when a write succeeds.
 *
 * The METHOD is the only signal available that is always right and needs no
 * per-call-site work — there are 222 mutating calls across 101 files, and a
 * convention that has to be repeated 222 times is one that will be missed.
 * DELETE is worth distinguishing because "Saved" after removing a record reads
 * as though it did the opposite.
 */
function writeAnnouncement(method: string, path: string): string | null {
  if (method === 'GET' || SILENT_WRITES.some((silent) => silent.test(path))) return null;
  return method === 'DELETE' ? 'Deleted' : 'Saved';
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errors?: Array<{ path: string; message: string }>,
    public readonly body?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // FormData bodies (file uploads) go through as multipart — the browser sets
  // the Content-Type boundary itself.
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  // Every request resets the API's rolling session clock, so this is the honest
  // place to record activity for the expiry warning.
  noteApiActivity();
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    // Belt to the API's `Cache-Control: no-store`: session-scoped responses must
    // never come from the HTTP cache. Safari otherwise reuses them across the
    // reloads that follow a "view as" change and re-renders the old view.
    cache: 'no-store',
    headers: body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });

  if (res.status === 401 && !path.startsWith('/auth/')) {
    /**
     * Session expired mid-use. The hard redirect stays — it guarantees no stale
     * authenticated state survives — but it no longer throws away WHERE the user
     * was. They previously landed on the Dashboard with no explanation and had to
     * navigate back to whatever record they had been reading.
     *
     * sessionStorage rather than a ?next= query param: these paths carry record
     * ids, and a same-tab handoff does the job without putting one in a URL that
     * might be logged or pasted somewhere.
     */
    try {
      const here = window.location.pathname + window.location.search;
      if (here && !here.startsWith('/login')) {
        sessionStorage.setItem('jumpstart.returnTo', here);
      }
      sessionStorage.setItem('jumpstart.signedOutReason', 'expired');
    } catch {
      // Private mode or quota — the redirect still has to happen.
    }
    window.location.assign('/login');
    throw new ApiError(401, 'Session expired');
  }

  /**
   * Above the 204 early return, deliberately: DELETE is the method most likely
   * to answer 204, and it is the one whose announcement matters most — removing
   * a record is the action a silent success is worst for.
   */
  if (res.ok) {
    const said = writeAnnouncement(method, path);
    if (said) announce(said);
  }

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? String((data as { message: unknown }).message)
        : `Request failed (${res.status})`;
    const errors =
      typeof data === 'object' && data !== null && 'errors' in data
        ? (data as { errors: Array<{ path: string; message: string }> }).errors
        : undefined;
    throw new ApiError(res.status, message, errors, data);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/** Standard list response shape returned by every list endpoint. */
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}
