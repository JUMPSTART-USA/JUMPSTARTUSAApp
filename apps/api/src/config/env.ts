import { z } from 'zod';

// Fail fast at boot with a readable message if the environment is misconfigured.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(3001),
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

export const isProduction = () => loadEnv().NODE_ENV === 'production';

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
