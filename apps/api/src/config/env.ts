import { z } from 'zod';

// Fail fast at boot with a readable message if the environment is misconfigured.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  /**
   * Which DEPLOYMENT this is — for logs, telemetry and human labelling only.
   * Deliberately separate from NODE_ENV, which selects the CODE PATH and should
   * be 'production' everywhere the app is deployed, staging included.
   *
   * They used to be one value, and staging ran NODE_ENV=staging. Because every
   * production protection was gated on `NODE_ENV === 'production'`, that single
   * string quietly turned three unrelated things off at once on a public HTTPS
   * host: the session cookie's Secure flag, the Swagger docs gate and the
   * error-detail gate. Nothing below is gated on APP_ENV — that is the point.
   */
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).optional(),
  API_PORT: z.coerce.number().int().default(3001),
  /**
   * Serve the Swagger UI at /api/docs. Defaults OFF, and off is what every
   * deployed environment gets unless someone opts in on purpose: the docs
   * publish every route, parameter and schema in the platform, and
   * SwaggerModule mounts straight onto Express — OUTSIDE the Nest guards, so
   * nothing checks a session or a permission in front of them.
   *
   * Local development opts in for you; see apiDocsEnabled().
   */
  ENABLE_API_DOCS: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters — generate with: openssl rand -hex 32'),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  /**
   * Extra origins the origin-check and CORS accept alongside WEB_ORIGIN —
   * comma-separated. WEB_ORIGIN stays the single CANONICAL origin (emails and
   * portal links are built from it); aliases exist so the old front door
   * keeps working after a custom-domain cutover.
   */
  WEB_ORIGIN_ALIASES: z.string().default(''),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  TURNSTILE_DEV_BYPASS: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  POSTMARK_SERVER_TOKEN: z.string().optional(),
  // Twilio SMS (§6.12) — all three required for sends; otherwise SMS fails
  // gracefully with "SMS provider not configured (Twilio pending)".
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  GRAPH_TENANT_ID: z.string().optional(),
  GRAPH_CLIENT_ID: z.string().optional(),
  GRAPH_CLIENT_SECRET: z.string().optional(),
  EMAIL_FROM: z.string().email().default('no-reply@jumpstartusa.org'),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Local dev convenience: load the repo-root .env (Node ≥20.12 built-in; does
 * NOT override variables already set, so PaaS/docker env always wins).
 */
function loadDotEnvFile() {
  for (const candidate of ['.env', '../.env', '../../.env']) {
    try {
      process.loadEnvFile(candidate);
      return;
    } catch {
      // missing file — try the next location
    }
  }
}

export function loadEnv(): Env {
  if (!cached) {
    loadDotEnvFile();
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Environment configuration invalid:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/**
 * There is deliberately no `isProduction()` here any more.
 *
 * Three unrelated security properties used to hang off it, so one environment
 * variable being 'staging' rather than 'production' turned all three off at
 * once — silently, on a public HTTPS host. Each now asks the question it
 * actually cares about, so a new environment can only get one of them wrong.
 */

/** Development only. Never true in a deployed environment. */
export const isDevelopment = () => loadEnv().NODE_ENV === 'development';

/**
 * Mark the session cookie Secure whenever the app is reached over HTTPS —
 * asked of the ORIGIN, not of the environment name. Every deployed environment
 * is HTTPS (App Service sets httpsOnly), and local dev over plain HTTP still
 * gets a usable cookie, which is the only case that needs the exception.
 */
export function sessionCookieSecure(): boolean {
  try {
    return new URL(loadEnv().WEB_ORIGIN).protocol === 'https:';
  } catch {
    return true; // unparseable origin — fail closed
  }
}

/** Swagger at /api/docs: explicit opt-in anywhere, automatic in local dev. */
export const apiDocsEnabled = () => loadEnv().ENABLE_API_DOCS || isDevelopment();

/** Deployment label for logs and telemetry — never a security decision. */
export const appEnv = () => {
  const env = loadEnv();
  return env.APP_ENV ?? env.NODE_ENV;
};

/** Every origin the API trusts for browser requests: canonical + aliases. */
export function webOrigins(env: { WEB_ORIGIN: string; WEB_ORIGIN_ALIASES: string }): string[] {
  return [
    env.WEB_ORIGIN,
    ...env.WEB_ORIGIN_ALIASES.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  ];
}

/**
 * WebAuthn relying-party id — DERIVED from the canonical origin, never its own
 * setting. A separate RP_ID env var was tried and is exactly the kind of knob
 * that silently defaults wrong: nothing set it in either deployed environment,
 * so every browser ceremony would have failed against rpID "localhost" while
 * the API happily served options. The host of WEB_ORIGIN is correct by
 * construction everywhere — localhost in dev, the custom domain in prod.
 *
 * Consequence worth knowing: passkeys only work on the CANONICAL origin. A
 * user who arrives on a WEB_ORIGIN_ALIASES host (the old front door kept alive
 * through a cutover) cannot register or use one there — the browser refuses an
 * rpID that is not a suffix of the page's own domain. The SPA surfaces that as
 * guidance rather than a dead button (see passkeysAvailable in /auth/me).
 */
export function rpId(env: { WEB_ORIGIN: string }): string {
  return new URL(env.WEB_ORIGIN).hostname;
}
