import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * jsdom leaves mounted trees behind between tests, and a stale tree makes
 * getByRole find the previous test's DOM — a failure mode that reads as a
 * mysteriously passing assertion.
 */
afterEach(() => {
  cleanup();
});

/** matchMedia is absent in jsdom; the layout reads it for the mobile drawer. */
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/** Vite's `define` supplies this in the app; tests get it here. */
if (typeof (globalThis as Record<string, unknown>).__BUILD_ID__ === 'undefined') {
  (globalThis as Record<string, unknown>).__BUILD_ID__ = 'test';
}
