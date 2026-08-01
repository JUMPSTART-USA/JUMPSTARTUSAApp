/**
 * Plain-fetch client for the tokenized participant portal. Deliberately NOT
 * the `api` wrapper from @/lib/api: that wrapper hard-redirects to /login on
 * any 401, and this page must never bounce a participant (who has no staff
 * session) to the login screen. The public endpoints answer 404 for unknown
 * or revoked tokens and 429 when throttled — plain fetch guarantees no
 * redirect even if the API ever misfires a 401. Failures are thrown as
 * ApiError so applyApiError's field mapping keeps working.
 */
import { ApiError } from '@/lib/api';

export interface PortalIdentity {
  firstName: string;
  participantNumber: string;
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/public/portal${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

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

export const portalApi = {
  /** GET /public/portal/:token — 404 means unknown or revoked. */
  identity: (token: string) => request<PortalIdentity>('GET', `/${encodeURIComponent(token)}`),
  /** POST /public/portal/:token/<path> with a schema-shaped body. */
  post: (token: string, path: string, body: unknown) =>
    request<{ ok: true }>('POST', `/${encodeURIComponent(token)}${path}`, body),
};
