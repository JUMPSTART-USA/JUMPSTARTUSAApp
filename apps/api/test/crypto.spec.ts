import { describe, expect, it } from 'vitest';
import { authenticator } from 'otplib';
import {
  decryptSecret,
  encryptSecret,
  isEncrypted,
  safeEqual,
  totpSecretContext,
} from '../src/common/crypto.util';
import { currentTotpStep, verifyTotpCode } from '../src/common/totp.util';

/**
 * Encryption for the columns holding a live secret.
 *
 * The schema claimed `totpSecret` was "encrypted at rest by the app layer" and
 * nothing in the repository encrypted anything. These tests pin the properties
 * that claim now depends on — particularly the two that are easy to lose in a
 * refactor and impossible to notice: that ciphertext is BOUND to its user, and
 * that legacy plaintext still reads.
 */

const SECRET = authenticator.generateSecret();
const USER = '11111111-1111-1111-1111-111111111111';
const OTHER_USER = '22222222-2222-2222-2222-222222222222';

describe('encryptSecret / decryptSecret', () => {
  it('round-trips', () => {
    const sealed = encryptSecret(SECRET, totpSecretContext(USER));
    expect(decryptSecret(sealed, totpSecretContext(USER))).toBe(SECRET);
  });

  it('does not leave the plaintext anywhere in the ciphertext', () => {
    const sealed = encryptSecret(SECRET, totpSecretContext(USER));
    expect(sealed).not.toContain(SECRET);
    expect(Buffer.from(sealed, 'utf8').includes(SECRET)).toBe(false);
  });

  it('produces different ciphertext each time, so equal secrets are not equal rows', () => {
    const a = encryptSecret(SECRET, totpSecretContext(USER));
    const b = encryptSecret(SECRET, totpSecretContext(USER));
    expect(a).not.toBe(b);
    // ...and both still decrypt.
    expect(decryptSecret(a, totpSecretContext(USER))).toBe(SECRET);
    expect(decryptSecret(b, totpSecretContext(USER))).toBe(SECRET);
  });

  it('REFUSES a ciphertext moved to another user row', () => {
    // The property the AAD exists for: someone with database write access
    // grafting their own enrolled secret onto an administrator's row.
    const sealed = encryptSecret(SECRET, totpSecretContext(USER));
    expect(() => decryptSecret(sealed, totpSecretContext(OTHER_USER))).toThrow();
  });

  it('REFUSES tampered ciphertext rather than decrypting to something else', () => {
    const sealed = encryptSecret(SECRET, totpSecretContext(USER));
    const parts = sealed.split('.');
    // Flip the last byte of the ciphertext segment.
    const data = Buffer.from(parts[3]!, 'base64url');
    data[data.length - 1] ^= 0xff;
    parts[3] = data.toString('base64url');
    expect(() => decryptSecret(parts.join('.'), totpSecretContext(USER))).toThrow();
  });

  it('throws on a malformed value instead of guessing', () => {
    expect(() => decryptSecret('v1.only-two.parts', totpSecretContext(USER))).toThrow();
  });
});

describe('legacy plaintext tolerance', () => {
  it('reads a pre-encryption row unchanged', () => {
    // Rows written before crypto.util existed. Without this an enrolled user
    // is locked out of the platform by a deploy.
    expect(decryptSecret(SECRET, totpSecretContext(USER))).toBe(SECRET);
  });

  it('can tell the two apart, which is what makes the backfill finishable', () => {
    expect(isEncrypted(SECRET)).toBe(false);
    expect(isEncrypted(encryptSecret(SECRET, totpSecretContext(USER)))).toBe(true);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted(undefined)).toBe(false);
  });
});

describe('verifyTotpCode', () => {
  it('accepts a valid code against an ENCRYPTED secret', () => {
    const sealed = encryptSecret(SECRET, totpSecretContext(USER));
    const code = authenticator.generate(SECRET);
    expect(verifyTotpCode(USER, sealed, code)).toBe(true);
  });

  it('accepts a valid code against a legacy PLAINTEXT secret', () => {
    const code = authenticator.generate(SECRET);
    expect(verifyTotpCode(USER, SECRET, code)).toBe(true);
  });

  it('rejects a wrong code', () => {
    const sealed = encryptSecret(SECRET, totpSecretContext(USER));
    expect(verifyTotpCode(USER, sealed, '000000')).toBe(false);
  });

  it('rejects when the account has no secret, rather than throwing', () => {
    expect(verifyTotpCode(USER, null, authenticator.generate(SECRET))).toBe(false);
    expect(verifyTotpCode(USER, undefined, '123456')).toBe(false);
  });

  it('throws if a secret is read under the wrong user, never silently fails closed', () => {
    // A verify that returned false here would look like "2FA is broken" and
    // send someone hunting in the wrong place.
    const sealed = encryptSecret(SECRET, totpSecretContext(USER));
    expect(() => verifyTotpCode(OTHER_USER, sealed, '123456')).toThrow();
  });
});

describe('currentTotpStep', () => {
  it('is stable within a window and advances between them', () => {
    const at = new Date('2026-08-15T12:00:00.000Z');
    const sameWindow = new Date('2026-08-15T12:00:29.000Z');
    const nextWindow = new Date('2026-08-15T12:00:31.000Z');

    expect(currentTotpStep(at)).toBe(currentTotpStep(sameWindow));
    expect(currentTotpStep(nextWindow)).toBeGreaterThan(currentTotpStep(at));
  });
});

describe('safeEqual', () => {
  it('matches identical strings and rejects differing ones', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true);
    expect(safeEqual('abc123', 'abc124')).toBe(false);
  });

  it('returns false on a length mismatch instead of throwing', () => {
    // timingSafeEqual throws on unequal lengths; that would itself be an
    // oracle, and an unhandled 500.
    expect(safeEqual('short', 'much longer value')).toBe(false);
    expect(safeEqual('', 'x')).toBe(false);
  });
});
