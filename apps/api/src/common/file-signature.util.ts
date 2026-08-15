/**
 * Magic-byte detection for the formats attachments and photos may carry.
 *
 * The uploaded Content-Type is a CLIENT-SUPPLIED STRING. It was trusted twice
 * over: to pass the allowlist, and then again as the Content-Type the download
 * echoed back to a browser. Anyone able to upload could therefore choose how
 * their bytes would later be interpreted — the classic "PNG that is really
 * HTML" trick. This reads the bytes instead.
 *
 * Hand-rolled rather than pulled from a package: the allowlist is short, fixed
 * and made of formats with stable, well-documented signatures, and a security
 * check is a poor place to add a dependency for its own sake.
 *
 * Container formats are honest about being containers. A .docx is a ZIP, so
 * ZIP-based Office documents detect as 'application/zip' and are reconciled
 * against the declared type by the caller — see attachmentContentType().
 */

interface Signature {
  type: string;
  /** Bytes that must match at `offset`. */
  magic: number[];
  offset?: number;
  /** Extra check for formats whose leading bytes are not sufficient. */
  verify?: (buf: Buffer) => boolean;
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

const SIGNATURES: Signature[] = [
  { type: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  { type: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/gif', magic: ascii('GIF87a') },
  { type: 'image/gif', magic: ascii('GIF89a') },
  // RIFF....WEBP — the size field sits between the two markers.
  {
    type: 'image/webp',
    magic: ascii('RIFF'),
    verify: (buf) => buf.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  { type: 'image/bmp', magic: ascii('BM') },
  { type: 'image/tiff', magic: [0x49, 0x49, 0x2a, 0x00] }, // little-endian
  { type: 'image/tiff', magic: [0x4d, 0x4d, 0x00, 0x2a] }, // big-endian
  // ISO-BMFF brands: ....ftypavif / ftypheic / ftypmif1 …
  {
    type: 'image/avif',
    magic: ascii('ftyp'),
    offset: 4,
    verify: (buf) => buf.subarray(8, 12).toString('latin1') === 'avif',
  },
  {
    type: 'image/heic',
    magic: ascii('ftyp'),
    offset: 4,
    verify: (buf) => ['heic', 'heix', 'heim', 'heis'].includes(buf.subarray(8, 12).toString('latin1')),
  },
  {
    type: 'image/heif',
    magic: ascii('ftyp'),
    offset: 4,
    verify: (buf) => ['mif1', 'msf1', 'hevc', 'hevx'].includes(buf.subarray(8, 12).toString('latin1')),
  },
  { type: 'application/pdf', magic: ascii('%PDF-') },
  // Every modern Office format is a ZIP. Legacy .doc/.xls/.ppt share the OLE2
  // compound-document header, so both collapse to one detected type each.
  { type: 'application/zip', magic: [0x50, 0x4b, 0x03, 0x04] },
  { type: 'application/zip', magic: [0x50, 0x4b, 0x05, 0x06] }, // empty archive
  { type: 'application/zip', magic: [0x50, 0x4b, 0x07, 0x08] }, // spanned
  { type: 'application/x-ole-storage', magic: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
];

/**
 * The type the BYTES say they are, or null when nothing matches — which is the
 * normal answer for text/plain and text/csv, formats that have no signature.
 */
export function detectContentType(buffer: Buffer): string | null {
  for (const sig of SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (buffer.length < offset + sig.magic.length) continue;
    if (!sig.magic.every((byte, i) => buffer[offset + i] === byte)) continue;
    if (sig.verify && !sig.verify(buffer)) continue;
    return sig.type;
  }
  return null;
}

/** Declared types that legitimately arrive as a ZIP container. */
const ZIP_BACKED = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

/** Declared types that legitimately arrive as a legacy OLE2 compound document. */
const OLE_BACKED = new Set([
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
]);

/**
 * Types with no magic bytes at all. A file claiming to be one of these is
 * accepted only if it does NOT sniff as something else — so HTML or an SVG
 * relabelled 'text/plain' still goes through, which is exactly why the download
 * path serves text as an attachment and never inline.
 */
const SIGNATURE_LESS = new Set(['text/plain', 'text/csv']);

/**
 * Reconcile the declared type with the detected one, returning the type to
 * STORE and serve — or null when the two disagree and the upload should be
 * refused.
 *
 * The detected type wins wherever the bytes are self-describing: that is the
 * whole point of looking at them.
 */
export function attachmentContentType(declared: string, buffer: Buffer): string | null {
  const detected = detectContentType(buffer);

  if (detected === null) {
    // Nothing recognisable. Only the signature-less formats may claim this.
    return SIGNATURE_LESS.has(declared) ? declared : null;
  }
  if (detected === 'application/zip') {
    return ZIP_BACKED.has(declared) ? declared : null;
  }
  if (detected === 'application/x-ole-storage') {
    return OLE_BACKED.has(declared) ? declared : null;
  }
  // Self-describing format: trust the bytes over the label. A JPEG uploaded as
  // 'image/png' is stored and served as a JPEG rather than rejected — the
  // mislabel is harmless once the served type follows the content.
  return detected;
}
