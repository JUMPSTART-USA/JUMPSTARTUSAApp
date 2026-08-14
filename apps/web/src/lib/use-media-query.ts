import { useSyncExternalStore } from 'react';

/**
 * A media query as React state, via useSyncExternalStore so the subscription
 * survives StrictMode double-invocation and never tears.
 *
 * Returns false wherever matchMedia does not exist (jsdom), which makes the
 * DEFAULT rendering mode the one tests exercise — a test that wants the other
 * branch stubs matchMedia and says so, rather than every existing test needing
 * a stub to keep passing.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false),
  );
}
