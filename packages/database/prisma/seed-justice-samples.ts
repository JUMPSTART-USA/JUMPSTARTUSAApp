/**
 * Additive sample data for the justice-history records: most serious
 * offenses (§7.2) and inside locations (§6.1) — for every participant with
 * any inside involvement. Like seed-cm-samples.ts this is safe on an
 * already-seeded database: each section is skipped for a participant who
 * already has rows of that kind, so re-runs never duplicate.
 *
 *   pnpm --filter @jumpstart/database seed:justice-samples
 *
 * Values are deterministic per participant (index arithmetic, no RNG) so
 * every environment seeded from the same participant set looks the same.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const NOW = new Date();
const TODAY = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
function daysAgo(n: number): Date {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return d;
}

function at<T>(arr: readonly T[], i: number): T {
  const v = arr[((i % arr.length) + arr.length) % arr.length];
  if (v === undefined) throw new Error('empty array');
  return v;
}

const OFFENSES = [
  { offense: 'Armed robbery', offenseType: 'violent', sentenceYears: 12 },
  { offense: 'Possession with intent to distribute', offenseType: 'non_violent', sentenceYears: 6 },
  { offense: 'Aggravated assault', offenseType: 'violent', sentenceYears: 8 },
  { offense: 'Burglary, second degree', offenseType: 'non_violent', sentenceYears: 5 },
  { offense: 'Grand larceny', offenseType: 'non_violent', sentenceYears: 3, sentenceMonths: 6 },
  { offense: 'Voluntary manslaughter', offenseType: 'violent', sentenceYears: 15 },
  { offense: 'Drug trafficking', offenseType: 'non_violent', sentenceYears: 10 },
  { offense: 'Breaking and entering', offenseType: 'non_violent', sentenceYears: 2, sentenceMonths: 6 },
  { offense: 'Assault and battery', offenseType: 'violent', sentenceYears: 1, sentenceMonths: 6 },
  { offense: 'Forgery', offenseType: 'non_violent', sentenceMonths: 18 },
  { offense: 'Unlawful possession of a firearm', offenseType: 'non_violent', sentenceYears: 4 },
  { offense: 'Carjacking', offenseType: 'violent', sentenceYears: 9 },
] as const;

async function main() {
  const participants = await prisma.participantProfile.findMany({
    where: { deletedAt: null },
    orderBy: { participantNumber: 'asc' },
    include: {
      insideEnrollments: {
        where: { deletedAt: null },
        select: { insideClass: { select: { institutionId: true } } },
        take: 1,
      },
      _count: { select: { offenses: true, insideLocations: true } },
    },
  });
  const institutions = await prisma.institution.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true },
  });
  if (institutions.length === 0) throw new Error('No institutions — run the main seed first');

  let offenseRows = 0;
  let locationRows = 0;

  for (const [i, p] of participants.entries()) {
    // Participants with no inside chapter keep clean records.
    const wasInside = p.insideStatus !== 'not_applicable' || p.insideEnrollments.length > 0;
    if (!wasInside) continue;

    // ── Most serious offenses: one for everyone, a second for every other ──
    if (p._count.offenses === 0) {
      const primary = at(OFFENSES, i);
      await prisma.participantOffense.create({
        data: {
          participantProfileId: p.id,
          offense: primary.offense,
          offenseType: primary.offenseType,
          convictionDate: daysAgo(1400 + (i % 7) * 233),
          sentenceYears: 'sentenceYears' in primary ? primary.sentenceYears : null,
          sentenceMonths: 'sentenceMonths' in primary ? primary.sentenceMonths : null,
        },
      });
      offenseRows++;
      if (i % 2 === 0) {
        const secondary = at(OFFENSES, i + 5);
        await prisma.participantOffense.create({
          data: {
            participantProfileId: p.id,
            offense: secondary.offense,
            offenseType: secondary.offenseType,
            convictionDate: daysAgo(2100 + (i % 5) * 180),
            sentenceYears: 'sentenceYears' in secondary ? secondary.sentenceYears : null,
            sentenceMonths: 'sentenceMonths' in secondary ? secondary.sentenceMonths : null,
          },
        });
        offenseRows++;
      }
    }

    // ── Inside locations: current for those still inside, closed history ──
    // otherwise; every third participant carries an earlier transfer row.
    if (p._count.insideLocations === 0) {
      const homeInstitution =
        p.insideEnrollments[0]?.insideClass.institutionId ?? at(institutions, i).id;
      const stillInside = p.insideStatus === 'enrolled' || p.insideStatus === 'active';
      const arrived = p.intakeDate ?? daysAgo(400 + (i % 9) * 30);
      let left = p.releaseDate ?? daysAgo(30 + (i % 6) * 15);
      if (left <= arrived) {
        left = new Date(arrived);
        left.setDate(left.getDate() + 90 + (i % 4) * 30);
      }

      if (i % 3 === 0) {
        const prior = at(institutions, i + 1).id;
        const priorArrived = new Date(arrived);
        priorArrived.setDate(priorArrived.getDate() - 180 - (i % 4) * 45);
        await prisma.participantInsideLocation.create({
          data: {
            participantProfileId: p.id,
            institutionId: prior === homeInstitution ? at(institutions, i + 2).id : prior,
            status: 'inactive',
            startDate: priorArrived,
            endDate: arrived,
            notes: 'Transferred',
          },
        });
        locationRows++;
      }
      await prisma.participantInsideLocation.create({
        data: {
          participantProfileId: p.id,
          institutionId: homeInstitution,
          status: stillInside ? 'active' : 'inactive',
          startDate: arrived,
          endDate: stillInside ? null : left,
        },
      });
      locationRows++;
    }
  }

  console.log(
    `Justice samples: ${offenseRows} offense rows and ${locationRows} inside-location rows added ` +
      `across ${participants.length} participants.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
