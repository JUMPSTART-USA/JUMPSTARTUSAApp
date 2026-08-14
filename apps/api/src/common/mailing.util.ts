/**
 * Mailing addresses (persons, donors, vendors, institutions): when
 * mailingSameAsPrimary is true — set in this payload, or already on the
 * record and not being turned off — the mailing* columns are forced to null.
 * The forms disable the mailing inputs while the box is checked, but the API
 * cannot trust that; nulling here guarantees stale values never linger and
 * every consumer can read "flag set ⇒ use the primary address" literally.
 */
const MAILING_KEYS = ['mailingAddressLine1', 'mailingCity', 'mailingState', 'mailingZip'] as const;

export function applyMailingSameRule<T extends { mailingSameAsPrimary?: boolean }>(
  data: T,
  currentlySame: boolean,
  // Person carries mailingAddressLine2; the org entities do not, and Prisma
  // rejects unknown columns — so line2 is only nulled where the model has it.
  opts: { hasLine2?: boolean } = {},
): T {
  const effective = data.mailingSameAsPrimary ?? currentlySame;
  if (!effective) return data;
  const out: Record<string, unknown> = { ...data };
  for (const key of MAILING_KEYS) out[key] = null;
  if (opts.hasLine2) out.mailingAddressLine2 = null;
  return out as T;
}

export interface MailingAddressSource {
  addressLine1: string | null;
  addressLine2?: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  mailingSameAsPrimary: boolean;
  mailingAddressLine1: string | null;
  mailingAddressLine2?: string | null;
  mailingCity: string | null;
  mailingState: string | null;
  mailingZip: string | null;
}

/**
 * Where mail actually goes: the separate mailing address when one is on file
 * (flag off + line 1 set — applyMailingSameRule above nulls the mailing
 * columns whenever the flag is on), else the primary address. One chooser
 * shared by letter generation and the giving-statements report so the person
 * and donor mail paths cannot drift.
 */
export function effectiveMailingAddress(r: MailingAddressSource): {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  if (!r.mailingSameAsPrimary && r.mailingAddressLine1) {
    return {
      addressLine1: r.mailingAddressLine1,
      addressLine2: r.mailingAddressLine2 ?? null,
      city: r.mailingCity,
      state: r.mailingState,
      zip: r.mailingZip,
    };
  }
  return {
    addressLine1: r.addressLine1,
    addressLine2: r.addressLine2 ?? null,
    city: r.city,
    state: r.state,
    zip: r.zip,
  };
}
