/**
 * Typed fetch wrapper for the platform API. Session-cookie auth: every request
 * carries credentials; 401 anywhere bounces to the login screen.
 */

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
    // Session expired mid-use: hard redirect keeps state consistent.
    window.location.assign('/login');
    throw new ApiError(401, 'Session expired');
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
