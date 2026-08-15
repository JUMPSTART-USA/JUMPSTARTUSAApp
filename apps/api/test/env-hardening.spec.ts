import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression cover for the three protections that used to hang off a single
 * `NODE_ENV === 'production'` check (config/env.ts).
 *
 * Because staging ran NODE_ENV=staging, that one string turned all three off at
 * once on a public HTTPS host — a non-Secure session cookie, an unauthenticated
 * Swagger UI at /api/docs, and raw internal error messages in responses. Each
 * now asks its own question, and each is asserted here separately so a future
 * environment can only ever get one of them wrong.
 *
 * loadEnv() memoises, so every case re-imports the module with a fresh registry.
 */

const BASE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db?schema=public',
  SESSION_SECRET: 'x'.repeat(32),
};

async function loadWith(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries({ ...BASE, ...overrides })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import('../src/config/env');
}

const ORIGINAL = { ...process.env };

beforeEach(() => {
  // Each case owns the whole environment — a leaked NODE_ENV from a previous
  // case is exactly the confusion this suite exists to catch.
  process.env = { ...ORIGINAL };
  delete process.env.APP_ENV;
  delete process.env.ENABLE_API_DOCS;
});

describe('session cookie Secure flag', () => {
  it('is set for an HTTPS origin even when the environment is not named "production"', async () => {
    const env = await loadWith({
      NODE_ENV: 'production',
      APP_ENV: 'staging',
      WEB_ORIGIN: 'https://staging.jumpstartusa.org',
    });
    expect(env.sessionCookieSecure()).toBe(true);
  });

  it('is set for the production origin', async () => {
    const env = await loadWith({
      NODE_ENV: 'production',
      WEB_ORIGIN: 'https://app.jumpstartusa.org',
    });
    expect(env.sessionCookieSecure()).toBe(true);
  });

  it('is not set for a plain-HTTP local origin, so local dev can still sign in', async () => {
    const env = await loadWith({ NODE_ENV: 'development', WEB_ORIGIN: 'http://localhost:5173' });
    expect(env.sessionCookieSecure()).toBe(false);
  });
});

describe('Swagger docs gate', () => {
  it('is closed in a deployed environment by default', async () => {
    const env = await loadWith({
      NODE_ENV: 'production',
      APP_ENV: 'staging',
      WEB_ORIGIN: 'https://staging.jumpstartusa.org',
    });
    expect(env.apiDocsEnabled()).toBe(false);
  });

  it('opens only on an explicit opt-in', async () => {
    const env = await loadWith({
      NODE_ENV: 'production',
      ENABLE_API_DOCS: 'true',
      WEB_ORIGIN: 'https://staging.jumpstartusa.org',
    });
    expect(env.apiDocsEnabled()).toBe(true);
  });

  it('opens automatically in local development', async () => {
    const env = await loadWith({ NODE_ENV: 'development' });
    expect(env.apiDocsEnabled()).toBe(true);
  });
});

describe('error-detail gate', () => {
  it('treats a deployed non-production APP_ENV as not development', async () => {
    const env = await loadWith({ NODE_ENV: 'production', APP_ENV: 'staging' });
    expect(env.isDevelopment()).toBe(false);
  });

  it('is open only for NODE_ENV=development', async () => {
    const env = await loadWith({ NODE_ENV: 'development' });
    expect(env.isDevelopment()).toBe(true);
  });
});

describe('APP_ENV', () => {
  it('labels the deployment without being a code-path switch', async () => {
    const env = await loadWith({ NODE_ENV: 'production', APP_ENV: 'staging' });
    expect(env.appEnv()).toBe('staging');
    // The label must not drag any protection with it.
    expect(env.isDevelopment()).toBe(false);
    expect(env.apiDocsEnabled()).toBe(false);
  });

  it('falls back to NODE_ENV when unset', async () => {
    const env = await loadWith({ NODE_ENV: 'production' });
    expect(env.appEnv()).toBe('production');
  });
});
