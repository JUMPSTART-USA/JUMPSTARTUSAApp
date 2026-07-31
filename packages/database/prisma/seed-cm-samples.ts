/**
 * Additive sample data for the Case Management verticals: drug tests, budgets
 * (items + payments), travel requests and incident reports — for EVERY
 * participant. Unlike seed.ts this is safe on an already-seeded database:
 * each section is skipped for a participant who already has rows of that
 * kind, so re-runs never duplicate.
 *
 *   pnpm --filter @jumpstart/database seed:cm-samples
 *
 * Values are deterministic per participant (index arithmetic, no RNG) so
 * every environment seeded from the same participant set looks the same.
 */
import { PrismaClient } from '@prisma/client';

const NOW = new Date();
const TODAY = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
function daysFromNow(n: number): Date {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + n);
  return d;
}
const daysAgo = (n: number) => daysFromNow(-n);

function at<T>(arr: readonly T[], i: number): T {
  const v = arr[((i % arr.length) + arr.length) % arr.length];
  if (v === undefined) throw new Error('empty array');
  return v;
}

const TEST_TYPES = ['urine_10_panel', 'urine_5_panel', 'saliva', 'breathalyzer', 'urine_12_panel'] as const;
const METHODS = ['Cash', 'Money order', 'Check'] as const;
const SUPERVISION_LABELS = ['Probation supervision', 'Parole supervision', 'Community supervision'] as const;
const DESTINATIONS = [
  'Columbia, SC',
  'Greenville, SC',
  'Charlotte, NC',
  'Atlanta, GA',
  'Nashville, TN',
  'Memphis, TN',
  'Augusta, GA',
  'Knoxville, TN',
] as const;
const PURPOSES = [
  'Family visit',
  'Job interview',
  'Medical appointment',
  'Church retreat',
  'Court appearance in home county',
  'Funeral of a family member',
] as const;

export async function seedCaseManagementSamples(
  prisma: PrismaClient,
  createdById: string | null,
): Promise<void> {
  const participants = await prisma.participantProfile.findMany({
    where: { deletedAt: null },
    orderBy: { participantNumber: 'asc' },
    select: { id: true, participantNumber: true },
  });

  let tests = 0;
  let items = 0;
  let payments = 0;
  let travel = 0;
  let incidents = 0;

  for (let i = 0; i < participants.length; i++) {
    const p = participants[i]!;
    const pid = p.id;
    const audit = { createdById: createdById ?? undefined };

    // ── Drug tests: 1-3 past tests, mostly negative ─────────────────────────
    if ((await prisma.drugTest.count({ where: { participantProfileId: pid } })) === 0) {
      const n = 1 + (i % 3);
      for (let t = 0; t < n; t++) {
        const isPositive = i % 7 === 3 && t === 0;
        const isInconclusive = i % 5 === 4 && t === 1;
        await prisma.drugTest.create({
          data: {
            participantProfileId: pid,
            testDate: daysAgo(7 + t * 30 + (i % 6)),
            testType: at(TEST_TYPES, i + t),
            result: isPositive ? 'positive' : isInconclusive ? 'inconclusive' : 'negative',
            notes: isPositive
              ? 'Positive screen — referred to case manager for follow-up plan.'
              : isInconclusive
                ? 'Sample inconclusive; retest scheduled.'
                : null,
            ...audit,
          },
        });
        tests++;
      }
    }

    // ── Budget: recurring obligations + payment history ─────────────────────
    if ((await prisma.budgetItem.count({ where: { participantProfileId: pid } })) === 0) {
      const start = daysAgo(60 + (i % 30));

      const programFee = await prisma.budgetItem.create({
        data: {
          participantProfileId: pid,
          category: 'program_fee',
          amount: 150,
          frequency: 'weekly',
          startDate: start,
          active: true,
          ...audit,
        },
      });
      items++;
      const weeks = 4 + (i % 5);
      for (let w = 0; w < weeks; w++) {
        await prisma.budgetPayment.create({
          data: {
            budgetItemId: programFee.id,
            participantProfileId: pid,
            paidDate: daysAgo(7 * (w + 1) + (i % 3)),
            amount: 150,
            method: at(METHODS, i + w),
            ...audit,
          },
        });
        payments++;
      }

      if (i % 3 !== 2) {
        const supervision = await prisma.budgetItem.create({
          data: {
            participantProfileId: pid,
            category: 'supervision_fee',
            label: at(SUPERVISION_LABELS, i),
            amount: 45 + (i % 4) * 10,
            frequency: 'monthly',
            startDate: start,
            active: true,
            ...audit,
          },
        });
        items++;
        await prisma.budgetPayment.create({
          data: {
            budgetItemId: supervision.id,
            participantProfileId: pid,
            paidDate: daysAgo(12 + (i % 10)),
            amount: 45 + (i % 4) * 10,
            method: 'Money order',
            ...audit,
          },
        });
        payments++;
      }

      if (i % 2 === 0) {
        await prisma.budgetItem.create({
          data: {
            participantProfileId: pid,
            category: 'tithe',
            amount: 15 + (i % 3) * 5,
            frequency: 'weekly',
            startDate: start,
            active: true,
            ...audit,
          },
        });
        items++;
      }

      if (i % 4 === 1) {
        await prisma.budgetItem.create({
          data: {
            participantProfileId: pid,
            category: 'treatment_program',
            label: 'Outpatient substance abuse program',
            amount: 75,
            frequency: 'monthly',
            startDate: start,
            active: true,
            ...audit,
          },
        });
        items++;
      }

      if (i % 5 === 0) {
        await prisma.budgetItem.create({
          data: {
            participantProfileId: pid,
            category: 'transportation',
            label: 'Monthly bus pass',
            amount: 40,
            frequency: 'monthly',
            startDate: start,
            active: true,
            ...audit,
          },
        });
        items++;
      }
    }

    // ── Travel requests: an approved past trip and/or a pending future one ──
    if ((await prisma.travelRequest.count({ where: { participantProfileId: pid } })) === 0) {
      if (i % 2 === 0) {
        const startDate = daysAgo(14 + (i % 10));
        await prisma.travelRequest.create({
          data: {
            participantProfileId: pid,
            startDate,
            endDate: daysAgo(14 + (i % 10) - 2),
            destination: at(DESTINATIONS, i),
            purpose: at(PURPOSES, i),
            status: i % 10 === 6 ? 'denied' : 'approved',
            decisionNotes:
              i % 10 === 6
                ? 'Denied — conflicts with treatment program schedule.'
                : 'Approved. Check in with house manager on return.',
            decidedById: createdById ?? undefined,
            decidedAt: daysAgo(16 + (i % 10)),
            ...audit,
          },
        });
        travel++;
      }
      if (i % 3 === 0) {
        await prisma.travelRequest.create({
          data: {
            participantProfileId: pid,
            startDate: daysFromNow(7 + (i % 14)),
            endDate: daysFromNow(9 + (i % 14)),
            destination: at(DESTINATIONS, i + 3),
            purpose: at(PURPOSES, i + 2),
            status: 'pending',
            ...audit,
          },
        });
        travel++;
      }
    }

    // ── Incident reports: some resolved minor, a few open ───────────────────
    if ((await prisma.incidentReport.count({ where: { participantProfileId: pid } })) === 0) {
      if (i % 3 === 1) {
        await prisma.incidentReport.create({
          data: {
            participantProfileId: pid,
            incidentDate: daysAgo(20 + (i % 15)),
            category: at(['curfew_violation', 'noncompliance', 'unauthorized_absence'] as const, i),
            severity: 'minor',
            description: 'Returned after curfew without prior approval from the house manager.',
            actionTaken: 'Verbal warning issued and rules agreement reviewed with participant.',
            status: 'resolved',
            resolutionNotes: 'No further occurrences; considered closed.',
            resolvedAt: daysAgo(15 + (i % 15)),
            ...audit,
          },
        });
        incidents++;
      }
      if (i % 7 === 2) {
        await prisma.incidentReport.create({
          data: {
            participantProfileId: pid,
            incidentDate: daysAgo(3 + (i % 5)),
            category: i % 2 === 0 ? 'substance_use' : 'altercation',
            severity: 'major',
            description:
              i % 2 === 0
                ? 'Suspected substance use reported by house manager; drug test ordered.'
                : 'Verbal altercation with another resident over shared chores.',
            actionTaken: 'Under review with program director.',
            status: 'in_review',
            ...audit,
          },
        });
        incidents++;
      }
    }
  }

  console.log(
    `CM samples: ${tests} drug tests, ${items} budget items, ${payments} payments, ` +
      `${travel} travel requests, ${incidents} incidents across ${participants.length} participants.`,
  );
}

// Standalone entry — run against an already-seeded database.
if (process.argv[1]?.endsWith('seed-cm-samples.ts')) {
  const prisma = new PrismaClient();
  (async () => {
    const admin = await prisma.user.findFirst({
      where: { email: 'admin@jumpstartusa.org' },
      select: { id: true },
    });
    await seedCaseManagementSamples(prisma, admin?.id ?? null);
    await prisma.$disconnect();
  })().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
}
