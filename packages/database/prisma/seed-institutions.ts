/**
 * Institution loader: creates the real correctional facilities for each state
 * chapter from prisma/data/institutions.json — compiled from the official
 * state DOC facility directories (source URLs in the data file).
 *
 * Additive and idempotent: a facility matching an existing institution's
 * name + state (case-insensitive) is skipped, never updated — staff edits in
 * the app always win over reruns of this loader. Safe to rerun whenever the
 * DOC lists change.
 *
 *   pnpm --filter @jumpstart/database seed:institutions
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface FacilityRow {
  name: string;
  institutionType: string;
  city: string | null;
  addressLine1: string | null;
  zip: string | null;
  mainPhone: string | null;
}

interface StateFile {
  state: string;
  sources: string[];
  coverage: string;
  facilities: FacilityRow[];
}

async function main() {
  const raw = readFileSync(join(__dirname, 'data', 'institutions.json'), 'utf8');
  const states = JSON.parse(raw) as StateFile[];

  let created = 0;
  let skipped = 0;
  for (const file of states) {
    let stateCreated = 0;
    for (const f of file.facilities) {
      if (!f.name?.trim()) continue;
      const existing = await prisma.institution.findFirst({
        where: {
          state: file.state,
          name: { equals: f.name.trim(), mode: 'insensitive' },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }
      await prisma.institution.create({
        data: {
          name: f.name.trim(),
          institutionType: f.institutionType?.trim() || null,
          state: file.state,
          city: f.city?.trim() || null,
          addressLine1: f.addressLine1?.trim() || null,
          zip: f.zip?.trim() || null,
          mainPhone: f.mainPhone?.trim() || null,
          active: true,
        },
      });
      created++;
      stateCreated++;
    }
    console.log(`${file.state}: ${stateCreated} created (${file.facilities.length} in file)`);
  }
  console.log(`Institutions: ${created} created, ${skipped} already present.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
