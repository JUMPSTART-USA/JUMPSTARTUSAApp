import { authenticator } from 'otplib';
import { decryptSecret, totpSecretContext } from './crypto.util';

/**
 * One place that turns a STORED totpSecret into a verdict on a 6-digit code.
 *
 * Before this, five call sites each did `authenticator.verify({ secret:
 * user.totpSecret ?? '' })` against a column the schema claimed was encrypted
 * and was not. Now that the column really is ciphertext, every one of them has
 * to decrypt first — and a call site that forgets would fail open in the worst
 * way: `verify` against a wrong secret simply returns false, so two-factor
 * would reject every valid code and the fix would look like "2FA is broken".
 *
 * Returns false for an absent secret rather than throwing: "this account has
 * no TOTP" is a normal state, not an error.
 */
export function verifyTotpCode(
  userId: string,
  storedSecret: string | null | undefined,
  token: string,
): boolean {
  if (!storedSecret) return false;
  const secret = decryptSecret(storedSecret, totpSecretContext(userId));
  return authenticator.verify({ token, secret });
}

/**
 * The time step a code belongs to — the counter TOTP derives the code from.
 *
 * Used to burn a code after it is spent. Without it a valid code stays valid
 * for the rest of its window, so a code observed over someone's shoulder, read
 * off a shared screen, or captured by a proxy can be replayed within 30
 * seconds. Storing the step (rather than the code) means the check costs one
 * integer comparison and never puts a live credential in the database.
 */
export function currentTotpStep(at: Date = new Date()): number {
  const step = authenticator.options.step ?? 30;
  return Math.floor(at.getTime() / 1000 / step);
}
