/**
 * Additive sample data for profile photos: a generated initials avatar (PNG,
 * brand-palette background, white initials) for every participant/volunteer
 * person and every donor. Like the other sample seeders this is safe on an
 * already-seeded database: records that already carry a photo are skipped, so
 * re-runs never duplicate and real uploads are never overwritten.
 *
 *   pnpm --filter @jumpstart/database seed:photo-samples
 *
 * Everything is generated in-process (no network, no image libraries): a 5x7
 * bitmap font scaled up and encoded as an RGB PNG via node:zlib — the same
 * self-contained spirit as seed-cm-samples' hand-built PDF.
 */
import { deflateSync } from 'node:zlib';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Minimal PNG encoder (8-bit RGB, filter 0) ───────────────────────────────

function crc32(buf: Buffer): number {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(head.length + 8);
  out.writeUInt32BE(data.length, 0);
  head.copy(out, 4);
  out.writeUInt32BE(crc32(head), head.length + 4);
  return out;
}

function encodePng(width: number, height: number, pixels: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── 5x7 bitmap font, A–Z (rows are 5-bit numbers, MSB = left column) ────────

const FONT: Record<string, number[]> = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11100, 0b10010, 0b10001, 0b10001, 0b10001, 0b10010, 0b11100],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
};

// Muted professional hues that sit well beside the navy/gold UI.
const PALETTE = [
  '#0F2346', // navy
  '#31517A', // slate blue
  '#155E63', // teal
  '#2F5233', // forest
  '#6B2737', // maroon
  '#59386B', // plum
  '#8A5A2B', // burnt orange
  '#44607A', // steel
] as const;

function rgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

const SIZE = 192;
const SCALE = 14; // glyph cell: 5x7 → 70x98
const GAP = SCALE;

function initialsAvatar(initials: string, paletteIdx: number): Buffer {
  const [br, bg, bb] = rgb(at(PALETTE, paletteIdx));
  const pixels = Buffer.alloc(SIZE * SIZE * 3);
  for (let i = 0; i < SIZE * SIZE; i++) {
    pixels[i * 3] = br;
    pixels[i * 3 + 1] = bg;
    pixels[i * 3 + 2] = bb;
  }
  const glyphs = [...initials].map((c) => FONT[c] ?? FONT.O!);
  const totalW = glyphs.length * 5 * SCALE + (glyphs.length - 1) * GAP;
  const x0 = Math.floor((SIZE - totalW) / 2);
  const y0 = Math.floor((SIZE - 7 * SCALE) / 2);
  glyphs.forEach((glyph, g) => {
    const gx = x0 + g * (5 * SCALE + GAP);
    glyph.forEach((row, ry) => {
      for (let rx = 0; rx < 5; rx++) {
        if (!(row & (1 << (4 - rx)))) continue;
        for (let sy = 0; sy < SCALE; sy++) {
          for (let sx = 0; sx < SCALE; sx++) {
            const px = gx + rx * SCALE + sx;
            const py = y0 + ry * SCALE + sy;
            const o = (py * SIZE + px) * 3;
            pixels[o] = 255;
            pixels[o + 1] = 255;
            pixels[o + 2] = 255;
          }
        }
      }
    });
  });
  return encodePng(SIZE, SIZE, pixels);
}

function at<T>(arr: readonly T[], i: number): T {
  const v = arr[((i % arr.length) + arr.length) % arr.length];
  if (v === undefined) throw new Error('empty array');
  return v;
}

function initialsOf(first: string, second: string): string {
  const a = (first.trim()[0] ?? 'O').toUpperCase();
  const b = (second.trim()[0] ?? '').toUpperCase();
  return /[A-Z]/.test(b) ? `${a}${b}` : a;
}

// ── Seeding ─────────────────────────────────────────────────────────────────

async function seedPersonPhotos(): Promise<number> {
  // One photo per PERSON — covers participants and volunteers, and a person
  // holding both profiles gets a single avatar, matching the shared photo.
  const persons = await prisma.person.findMany({
    where: {
      deletedAt: null,
      photoMimeType: null, // never overwrite a real upload
      OR: [{ participantProfile: { isNot: null } }, { volunteerProfile: { isNot: null } }],
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, firstName: true, lastName: true },
  });

  for (const [i, p] of persons.entries()) {
    const initials = initialsOf(p.firstName, p.lastName);
    await prisma.person.update({
      where: { id: p.id },
      data: {
        photoData: new Uint8Array(initialsAvatar(initials, i)),
        photoMimeType: 'image/png',
        photoFileName: `demo-avatar-${initials.toLowerCase()}.png`,
      },
    });
  }
  return persons.length;
}

async function seedDonorPhotos(): Promise<number> {
  const donors = await prisma.donor.findMany({
    where: { deletedAt: null, photoMimeType: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });

  for (const [i, d] of donors.entries()) {
    // "Aldon Perry" → AP; "Palmetto Trust Foundation" → PT (logo-style tile).
    const words = d.name.split(/\s+/).filter(Boolean);
    const initials = initialsOf(words[0] ?? 'O', words[1] ?? '');
    await prisma.donor.update({
      where: { id: d.id },
      data: {
        photoData: new Uint8Array(initialsAvatar(initials, i + 3)),
        photoMimeType: 'image/png',
        photoFileName: `demo-avatar-${initials.toLowerCase()}.png`,
      },
    });
  }
  return donors.length;
}

async function main() {
  const persons = await seedPersonPhotos();
  const donors = await seedDonorPhotos();
  console.log(`Persons (participants + volunteers): +${persons} photos\nDonors: +${donors} photos`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
