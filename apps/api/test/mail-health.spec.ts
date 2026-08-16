import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The health check has to answer "does outbound email work", not "are three
 * environment variables set".
 *
 * It reported `configured` for weeks while every send failed with a 401 — the
 * stored Graph client secret was a secret ID rather than a secret value. The
 * password reset, the lockout warning and the invitation were all being
 * dropped, and the endpoint whose job is to notice said everything was fine.
 *
 * These pin the four properties that make the new probe useful rather than
 * merely present.
 */

const CONFIGURED_ENV = {
  GRAPH_TENANT_ID: 'tenant-id',
  GRAPH_CLIENT_ID: 'client-id',
  GRAPH_CLIENT_SECRET: 'client-secret',
};

/**
 * loadEnv() MEMOISES, so setting process.env after the first call changes
 * nothing — the module registry has to be reset and the module re-imported for
 * each case. Same reason env-hardening.spec.ts does this.
 */
async function makeService(env: Record<string, string | undefined> = CONFIGURED_ENV) {
  vi.resetModules();
  const base = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db?schema=public',
    SESSION_SECRET: 'x'.repeat(32),
    ENCRYPTION_KEY: 'a'.repeat(64),
  };
  for (const [k, v] of Object.entries({ ...base, ...env })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const { MailService: Fresh } = await import('../src/mail/mail.service');
  const prisma = { appSetting: { findUnique: async () => null } };
  return new Fresh(prisma as never);
}

const ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
});

describe('unconfigured mail', () => {
  it('is reported as unconfigured, and does not pretend to have been checked', async () => {
    const mail = await makeService({ ...CONFIGURED_ENV, GRAPH_CLIENT_SECRET: undefined });
    const health = mail.health();
    expect(health.configured).toBe(false);
    expect(health.sendPath).toBe('unconfigured');
    expect(health.checkedAt).toBeNull();
  });
});

describe('configured mail whose credential is REJECTED', () => {
  it('reports failing, not configured — the bug this exists for', async () => {
    const mail = await makeService();
    // Entra's answer when the secret is wrong (AADSTS7000215 rides in the body).
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":"invalid_client"}', { status: 401 }),
    );

    expect(await mail.probeSendPath()).toBe('failing');
    const health = mail.health();
    expect(health.configured).toBe(true);
    expect(health.sendPath).toBe('failing');
    expect(health.checkedAt).not.toBeNull();
  });

  it('does not leak the identity-provider detail to a PUBLIC endpoint', async () => {
    const mail = await makeService();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error_description":"AADSTS7000215: Invalid client secret provided"}', {
        status: 401,
      }),
    );
    await mail.probeSendPath();

    // /api/health is @Public. The AADSTS code describes the tenant's identity
    // configuration and belongs in the log, not in an anonymous response.
    const serialised = JSON.stringify(mail.health());
    expect(serialised).not.toMatch(/AADSTS/);
    expect(serialised).not.toMatch(/invalid_client/);
    expect(serialised).not.toMatch(/client-secret/);
  });
});

describe('configured mail that WORKS', () => {
  it('reports ok', async () => {
    const mail = await makeService();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }), { status: 200 }),
    );
    expect(await mail.probeSendPath()).toBe('ok');
    expect(mail.health().sendPath).toBe('ok');
  });
});

describe('health() never blocks on the network', () => {
  it('returns immediately even when the identity provider hangs', async () => {
    const mail = await makeService();
    // A fetch that never settles — an Entra outage.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}) as never);

    const started = Date.now();
    const health = mail.health();
    const elapsed = Date.now() - started;

    /**
     * healthCheckPath decides whether App Service keeps this instance in
     * rotation. If health awaited the probe, an Entra slowdown would take a
     * perfectly working API out of service — the check causing the outage it
     * exists to report.
     */
    expect(elapsed).toBeLessThan(50);
    expect(health.sendPath).toBe('unknown');
  });

  it('collapses concurrent probes into one call to the identity provider', async () => {
    const mail = await makeService();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }), { status: 200 }),
      );

    await Promise.all([mail.probeSendPath(), mail.probeSendPath(), mail.probeSendPath()]);
    // The App Service probe hits health about once a minute; three concurrent
    // callers must not become three token requests.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
