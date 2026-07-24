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
  TURNSTILE_SECRET_KEY: z.string().optional(),
  TURNSTILE_DEV_BYPASS: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  BLOOMERANG_API_KEY: z.string().optional(),
  POSTMARK_SERVER_TOKEN: z.string().optional(),
  EMAIL_FROM: z.string().email().default('no-reply@jumpstartusa.org'),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (!cached) {
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
