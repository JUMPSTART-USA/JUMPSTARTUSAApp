import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { loadEnv } from '../config/env';

/**
 * Authenticated encryption for the few columns that hold a live secret.
 *
 * The schema claimed `totpSecret` was "encrypted at rest by the app layer".
 * Nothing in the repository encrypted anything — the secret was written
 * straight from otplib's generator. Anyone who could read the database (a
 * backup, a snapshot restored onto a laptop, a support query) could mint valid
 * TOTP codes for every enrolled account and walk past two-factor entirely.
 *
 * AES-256-GCM, so the ciphertext is tamper-EVIDENT as well as unreadable: a
 * flipped bit in the database fails the auth tag instead of silently decrypting
 * to a different secret.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const PREFIX = 'v1';

/**
 * Self-identifying so a row can be read without knowing how it was written:
 * `v1.<iv>.<tag>.<ciphertext>`, base64url. The version segment is what makes a
 * future key rotation or algorithm change a migration rather than a flag day.
 */
const SEPARATOR = '.';

let cachedKey: Buffer | undefined;

function key(): Buffer {
  if (!cachedKey) {
    const raw = loadEnv().ENCRYPTION_KEY;
    cachedKey = Buffer.from(raw, 'hex');
    if (cachedKey.length !== 32) {
      // Belt to the schema's braces — a 64-char string that is not valid hex
      // decodes short and would otherwise fail much later, at first use.
      throw new Error('ENCRYPTION_KEY must be 32 bytes of hex (64 hex characters)');
    }
  }
  return cachedKey;
}

/**
 * Encrypt a secret, binding it to `context` (additional authenticated data).
 *
 * The context is what stops a ciphertext being MOVED: a totpSecret lifted from
 * one user's row and pasted into another's fails to decrypt, because the
 * context carries the user id. Without it, database write access would let
 * someone graft their own enrolled secret onto an administrator's account.
 */
export function encryptSecret(plaintext: string, context: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    PREFIX,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(SEPARATOR);
}

/** True when a stored value is ciphertext this module wrote. */
export function isEncrypted(stored: string | null | undefined): boolean {
  return typeof stored === 'string' && stored.startsWith(PREFIX + SEPARATOR);
}

/**
 * Decrypt a stored value, or return it unchanged when it is LEGACY PLAINTEXT.
 *
 * The tolerance is deliberate and temporary: rows written before this existed
 * are plaintext, and an account whose second factor stopped working because of
 * a deployment is an account locked out of the platform. `scripts/
 * encrypt-secrets.ts` converts them; the tolerance can go once it has run
 * everywhere and `isEncrypted` holds for every row.
 *
 * Throws on ciphertext that fails the auth tag — a wrong key or a tampered row
 * must be loud, never a silent fallback to "treat it as plaintext".
 */
export function decryptSecret(stored: string, context: string): string {
  if (!isEncrypted(stored)) return stored;

  const [, ivPart, tagPart, dataPart] = stored.split(SEPARATOR);
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error('Encrypted value is malformed');
  }
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivPart, 'base64url'));
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** AAD for a user's TOTP secret. Changing this invalidates existing rows. */
export const totpSecretContext = (userId: string) => `totp-secret:${userId}`;

/**
 * Constant-time string comparison, for secrets compared by value rather than
 * by a password hash (portal link tokens). `===` on a token leaks its prefix
 * through timing to anyone who can measure enough requests.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on a length mismatch, which would itself be a
  // length oracle — compare lengths separately and always run the comparison.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
