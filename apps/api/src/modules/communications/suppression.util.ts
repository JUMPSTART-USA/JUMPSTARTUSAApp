import type { CommChannel, Prisma } from '@jumpstart/database';

export interface SuppressionPerson {
  doNotContact: boolean;
  mailOnly: boolean;
  emailOk: boolean;
  primaryEmail: string | null;
  smsOk: boolean;
  smsConsentAt: Date | null;
  primaryPhone: string | null;
  addressLine1: string | null;
  /** A separate mailing address counts as an address for the letter channel. */
  mailingSameAsPrimary: boolean;
  mailingAddressLine1: string | null;
}

/** Letters can go to the primary address or a separate mailing address. */
function hasMailableAddress(person: SuppressionPerson): boolean {
  if (person.addressLine1) return true;
  return !person.mailingSameAsPrimary && !!person.mailingAddressLine1;
}

/**
 * §6.12 suppression, enforced everywhere a message leaves the platform:
 *  - doNotContact blocks every channel, no override.
 *  - mailOnly persons accept only letters.
 *  - email needs the opt-in flag AND an address on file.
 *  - SMS needs the opt-in flag AND its recorded timestamp (TCPA) AND a phone.
 *  - letters need a mailing address.
 * Returns the human-readable block reason, or null when sendable.
 * (emailBouncedAt is deliberately NOT here — it is deliverability, not
 * consent: one-off sends warn but proceed; batches exclude it in the query.)
 */
export function suppressionReason(person: SuppressionPerson, channel: CommChannel): string | null {
  if (person.doNotContact) return 'Person is marked do-not-contact';
  if (person.mailOnly && channel !== 'letter') {
    return 'Person is mail-only — only letters are allowed';
  }
  if (channel === 'email') {
    if (!person.emailOk) return 'Person has opted out of email';
    if (!person.primaryEmail) return 'Person has no email address on file';
  }
  if (channel === 'sms') {
    if (!person.smsOk || !person.smsConsentAt) {
      return 'Person has no recorded SMS opt-in (TCPA)';
    }
    if (!person.primaryPhone) return 'Person has no phone number on file';
  }
  if (channel === 'letter' && !hasMailableAddress(person)) {
    return 'Person has no mailing address on file';
  }
  return null;
}

/**
 * The same rules as a Prisma where-clause for batch audience building —
 * doNotContact excluded ALWAYS, channel consent enforced per §6.12. Batches
 * additionally skip bounced email addresses (no human is watching each send).
 */
export function channelConsentWhere(channel: CommChannel): Prisma.PersonWhereInput {
  return {
    doNotContact: false,
    ...(channel === 'email'
      ? { mailOnly: false, emailOk: true, primaryEmail: { not: null }, emailBouncedAt: null }
      : {}),
    ...(channel === 'sms'
      ? {
          mailOnly: false,
          smsOk: true,
          smsConsentAt: { not: null },
          primaryPhone: { not: null },
        }
      : {}),
    ...(channel === 'letter'
      ? {
          // Mirrors hasMailableAddress. The sole caller wraps this object in
          // an AND array, so the OR cannot collide with audience filters.
          OR: [
            { addressLine1: { not: null } },
            { mailingSameAsPrimary: false, mailingAddressLine1: { not: null } },
          ],
        }
      : {}),
  };
}
