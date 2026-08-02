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

/** Minimal valid single-page PDF (Helvetica text) — no dependencies. */
function makePdf(title: string, lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const text = [
    'BT /F1 16 Tf 72 720 Td (' + esc(title) + ') Tj ET',
    ...lines.map(
      (l, idx) => 'BT /F1 11 Tf 72 ' + (692 - idx * 18) + ' Td (' + esc(l) + ') Tj ET',
    ),
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Length ' + Buffer.byteLength(text) + ' >>\nstream\n' + text + '\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, idx) => {
    offsets.push(Buffer.byteLength(body));
    body += `${idx + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(body);
  body +=
    'xref\n0 ' +
    (objects.length + 1) +
    '\n0000000000 65535 f \n' +
    offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') +
    'trailer\n<< /Size ' +
    (objects.length + 1) +
    ' /Root 1 0 R >>\nstartxref\n' +
    xrefStart +
    '\n%%EOF';
  return Buffer.from(body, 'binary');
}

export async function seedCaseManagementSamples(
  prisma: PrismaClient,
  createdById: string | null,
): Promise<void> {
  const participants = await prisma.participantProfile.findMany({
    where: { deletedAt: null },
    orderBy: { participantNumber: 'asc' },
    select: { id: true, participantNumber: true, assignedCaseManagerId: true },
  });

  // Checklists snapshot the default template's items, mirroring the real
  // instantiation flow; fall back to a fixed list on template-less DBs.
  const template = await prisma.onboardingChecklistTemplate.findFirst({
    where: { active: true },
    orderBy: { isDefault: 'desc' },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  const checklistItems: { label: string; sortOrder: number; required: boolean; templateItemId?: string }[] =
    template && template.items.length > 0
      ? template.items.map((it) => ({
          label: it.label,
          sortOrder: it.sortOrder,
          required: it.required,
          templateItemId: it.id,
        }))
      : [
          'Intake form completed',
          'Identity documents collected',
          'Release paperwork on file',
          'Needs assessment completed',
          'Case manager assigned',
          'Service plan created',
        ].map((label, idx) => ({ label, sortOrder: idx + 1, required: true }));

  let tests = 0;
  let items = 0;
  let payments = 0;
  let travel = 0;
  let incidents = 0;
  let checklists = 0;
  let plans = 0;
  let notes = 0;
  let services = 0;
  let documents = 0;

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

    const cmUserId = p.assignedCaseManagerId ?? createdById;

    // ── Onboarding checklist: staged progress from the template ─────────────
    if (
      (await prisma.onboardingChecklist.count({ where: { participantProfileId: pid } })) === 0
    ) {
      // progress tier: 0 = done, 1 = ~70%, 2 = half, 3 = just started
      const tier = i % 4;
      const doneThrough = [checklistItems.length, Math.ceil(checklistItems.length * 0.7), Math.ceil(checklistItems.length / 2), 1][tier]!;
      const startedAt = daysAgo(45 + (i % 30));
      await prisma.onboardingChecklist.create({
        data: {
          participantProfileId: pid,
          templateId: template?.id,
          startedAt,
          completedAt: tier === 0 ? daysAgo(20 + (i % 10)) : null,
          ...audit,
          items: {
            create: checklistItems.map((it, idx) => ({
              label: it.label,
              sortOrder: it.sortOrder,
              required: it.required,
              templateItemId: it.templateItemId,
              status:
                idx < doneThrough
                  ? 'completed'
                  : idx === doneThrough && tier !== 0
                    ? 'in_progress'
                    : 'pending',
              completedAt: idx < doneThrough ? daysAgo(40 - idx * 3 + (i % 5)) : null,
              completedById: idx < doneThrough ? (cmUserId ?? undefined) : undefined,
            })),
          },
        },
      });
      checklists++;
    }

    // ── Service plan with goals + milestones ────────────────────────────────
    if ((await prisma.servicePlan.count({ where: { participantProfileId: pid } })) === 0) {
      const planDone = i % 5 === 4;
      const goalDefs = [
        {
          category: 'employment' as const,
          description: 'Secure and maintain full-time employment',
          milestones: ['Complete resume with employment coordinator', 'Apply to five partner employers', 'Complete first 30 days on the job'],
        },
        {
          category: 'housing' as const,
          description: 'Transition to stable independent housing',
          milestones: ['Save first month deposit', 'Complete rental application workshop'],
        },
        {
          category: i % 2 === 0 ? ('financial' as const) : ('treatment' as const),
          description:
            i % 2 === 0
              ? 'Build a working budget and open a savings account'
              : 'Complete outpatient treatment program requirements',
          milestones: ['Attend weekly sessions for one month'],
        },
      ].slice(0, 2 + (i % 2));
      await prisma.servicePlan.create({
        data: {
          participantProfileId: pid,
          title: 'Re-entry Service Plan',
          status: planDone ? 'completed' : 'active',
          reviewDate: planDone ? null : daysFromNow(14 + (i % 30)),
          notes: 'Reviewed with participant; goals set together.',
          ...audit,
          goals: {
            create: goalDefs.map((g, gi) => ({
              category: g.category,
              description: g.description,
              targetDate: daysFromNow(30 + gi * 30 + (i % 15)),
              status: planDone
                ? 'achieved'
                : gi === 0
                  ? 'in_progress'
                  : ('not_started' as const),
              ...audit,
              milestones: {
                create: g.milestones.map((m, mi) => ({
                  description: m,
                  dueDate: daysFromNow(14 + gi * 30 + mi * 14),
                  completedAt: planDone || (gi === 0 && mi === 0) ? daysAgo(5 + mi * 7) : null,
                })),
              },
            })),
          },
        },
      });
      plans++;
    }

    // ── Case notes: a realistic contact trail ───────────────────────────────
    if (
      cmUserId &&
      (await prisma.caseNote.count({ where: { participantProfileId: pid } })) === 0
    ) {
      const NOTE_SEEDS = [
        { category: 'general' as const, contactType: 'in_person' as const, content: 'Weekly check-in at the house. Spirits are good; sleeping well and attending morning devotions consistently.' },
        { category: 'employment' as const, contactType: 'phone' as const, content: 'Called to prep for interview on Thursday. Reviewed likely questions and transportation plan; he has clothes ready.' },
        { category: 'housing' as const, contactType: 'in_person' as const, content: 'Discussed move toward independent housing after program completion. Started deposit savings envelope.' },
        { category: 'family' as const, contactType: 'phone' as const, content: 'Spoke about upcoming visit with his children. Coordinated with family and reviewed expectations for the weekend.' },
        { category: 'treatment' as const, contactType: 'in_person' as const, content: 'Attended outpatient session; counselor reports steady engagement. No concerns this week.' },
        { category: 'financial' as const, contactType: 'in_person' as const, content: 'Walked through budget together. Program fees current; set aside $40 toward savings goal this week.' },
        { category: 'spiritual_support' as const, contactType: 'other' as const, content: 'Joined the men\'s Bible study group at the partner church; mentor from congregation checking in weekly.' },
      ];
      const n = 3 + (i % 5);
      for (let k = 0; k < n; k++) {
        const seed = at(NOTE_SEEDS, i + k);
        const followUp = (i + k) % 6 === 2;
        await prisma.caseNote.create({
          data: {
            participantProfileId: pid,
            caseManagerId: cmUserId,
            noteDate: daysAgo(4 + k * 9 + (i % 4)),
            contactType: seed.contactType,
            category: seed.category,
            content: seed.content,
            followUpRequired: followUp,
            followUpDate: followUp ? daysFromNow(3 + (k % 7)) : null,
            confidential: i % 8 === 5 && k === 0,
            ...audit,
          },
        });
        notes++;
      }
    }

    // ── Case services ───────────────────────────────────────────────────────
    if ((await prisma.caseService.count({ where: { participantProfileId: pid } })) === 0) {
      const SERVICE_SEEDS = [
        { serviceType: 'Bus pass', providerName: 'JUMPSTART staff', outcome: 'Provided; monitoring' },
        { serviceType: 'ID / documents assistance', providerName: 'JUMPSTART staff', outcome: 'State ID appointment scheduled' },
        { serviceType: 'Clothing assistance', providerName: 'Harvest Hands Food Bank', outcome: 'Need met — no further action' },
        { serviceType: 'Employment readiness', providerName: 'JUMPSTART staff', outcome: 'Resume completed' },
        { serviceType: 'Food assistance', providerName: 'Harvest Hands Food Bank', outcome: 'Provided; monitoring' },
        { serviceType: 'Benefits enrollment (SNAP, Medicaid…)', providerName: 'County benefits office', outcome: 'Application submitted' },
      ];
      const n = 2 + (i % 4);
      for (let k = 0; k < n; k++) {
        const seed = at(SERVICE_SEEDS, i + k);
        await prisma.caseService.create({
          data: {
            participantProfileId: pid,
            serviceType: seed.serviceType,
            serviceDate: daysAgo(6 + k * 11 + (i % 5)),
            providerName: seed.providerName,
            outcome: seed.outcome,
            followUpRequired: (i + k) % 7 === 3,
            followUpDate: (i + k) % 7 === 3 ? daysFromNow(7) : null,
            ...audit,
          },
        });
        services++;
      }
    }

    // ── Uploaded documents: small generated PDFs on the participant record ──
    if (
      (await prisma.attachment.count({
        where: { entityType: 'participant_profile', entityId: pid, deletedAt: null },
      })) === 0
    ) {
      const DOC_SEEDS = [
        { filename: 'state-id-copy.pdf', title: 'State ID (copy)', sensitivity: 'sensitive' as const },
        { filename: 'release-paperwork.pdf', title: 'Release paperwork', sensitivity: 'sensitive' as const },
        { filename: 'program-agreement-signed.pdf', title: 'Program agreement (signed)', sensitivity: 'standard' as const },
        { filename: 'resume.pdf', title: 'Resume', sensitivity: 'standard' as const },
      ];
      const n = 2 + (i % 3);
      for (let k = 0; k < n && k < DOC_SEEDS.length; k++) {
        const docSeed = DOC_SEEDS[(i + k) % DOC_SEEDS.length]!;
        const pdf = makePdf(docSeed.title, [
          `Participant ${p.participantNumber}`,
          'JUMPSTART USA Operations Platform — sample document.',
          'Generated for demonstration purposes only; contains no real PII.',
        ]);
        await prisma.attachment.create({
          data: {
            entityType: 'participant_profile',
            entityId: pid,
            data: new Uint8Array(pdf),
            filename: docSeed.filename,
            contentType: 'application/pdf',
            sizeBytes: pdf.length,
            sensitivity: docSeed.sensitivity,
            uploadedById: createdById ?? undefined,
          },
        });
        documents++;
      }
    }
  }

  console.log(
    `CM samples: ${tests} drug tests, ${items} budget items, ${payments} payments, ` +
      `${travel} travel requests, ${incidents} incidents, ${checklists} checklists, ` +
      `${plans} service plans, ${notes} notes, ${services} services, ${documents} documents ` +
      `across ${participants.length} participants.`,
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
