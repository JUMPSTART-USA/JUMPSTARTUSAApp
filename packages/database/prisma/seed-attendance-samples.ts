/**
 * Additive sample data for Sessions & attendance: weekly sessions with
 * realistic attendance marks for every ACTIVE or COMPLETED inside class and
 * outside program that has enrollments. Like seed-cm-samples this is safe on
 * an already-seeded database: sessions are created per DATE and skipped when
 * the class/program already holds a session on that date, and attendance is
 * only written for sessions this script creates — re-runs never duplicate
 * and hand-entered sessions are never touched.
 *
 *   pnpm --filter @jumpstart/database seed:attendance-samples
 *
 * Values are deterministic (index arithmetic, no RNG) so every environment
 * seeded from the same class set looks the same. The NEWEST session of each
 * ACTIVE class/program is left unmarked so staff can demo taking attendance.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const NOW = new Date();
const TODAY = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function at<T>(arr: readonly T[], i: number): T {
  const v = arr[((i % arr.length) + arr.length) % arr.length];
  if (v === undefined) throw new Error('empty array');
  return v;
}

const TOPICS = [
  'Orientation & expectations',
  'Identity and character',
  'Handling conflict',
  'Integrity under pressure',
  'Family and relationships',
  'Financial basics',
  'Work ethic and reliability',
  'Communication skills',
  'Setting goals',
  'Serving others',
  'Accountability partners',
  'Review and reflection',
] as const;

/**
 * Deterministic attendance status. Weights: ~70% present, 5% late,
 * 15% absent, 10% excused — enough variety for the reports to be
 * interesting without looking like a coin flip.
 */
function statusFor(classIdx: number, sessionIdx: number, enrollmentIdx: number): string {
  const n = (classIdx * 7 + sessionIdx * 17 + enrollmentIdx * 31) % 20;
  if (n < 14) return 'present';
  if (n === 14) return 'late';
  if (n < 18) return 'absent';
  return 'excused';
}

/** Weekly session dates from start until cap (end/today), newest last, max n. */
function weeklyDates(start: Date, cap: Date, max: number): Date[] {
  const dates: Date[] = [];
  for (let d = new Date(start); d <= cap; d = addDays(d, 7)) dates.push(new Date(d));
  return dates.slice(-max);
}

const sameDay = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

async function seedInsideAttendance(): Promise<{ sessions: number; marks: number }> {
  const classes = await prisma.insideClass.findMany({
    where: { deletedAt: null, status: { in: ['active', 'completed'] } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      sessions: { select: { sessionDate: true } },
      enrollments: { where: { deletedAt: null }, orderBy: { enrollmentDate: 'asc' }, select: { id: true } },
    },
  });

  let sessions = 0;
  let marks = 0;
  for (const [ci, cls] of classes.entries()) {
    if (cls.enrollments.length === 0) continue;
    const cap = cls.status === 'completed' && cls.endDate && cls.endDate < TODAY ? cls.endDate : TODAY;
    const dates = weeklyDates(cls.startDate, cap, cls.status === 'completed' ? 12 : 10);

    for (const [si, date] of dates.entries()) {
      if (cls.sessions.some((s) => sameDay(s.sessionDate, date))) continue;
      const session = await prisma.insideClassSession.create({
        data: { insideClassId: cls.id, sessionDate: date, topic: `Week ${si + 1} — ${at(TOPICS, ci + si)}` },
      });
      sessions += 1;

      // The newest session of an ACTIVE class stays unmarked for demos.
      if (cls.status === 'active' && si === dates.length - 1) continue;
      await prisma.sessionAttendance.createMany({
        data: cls.enrollments.map((e, ei) => ({
          sessionId: session.id,
          enrollmentId: e.id,
          status: statusFor(ci, si, ei),
        })),
      });
      marks += cls.enrollments.length;
    }
  }
  return { sessions, marks };
}

async function seedOutsideAttendance(): Promise<{ sessions: number; marks: number }> {
  const programs = await prisma.outsideProgram.findMany({
    where: { deletedAt: null, status: { in: ['active', 'completed'] } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      sessions: { select: { sessionDate: true } },
      enrollments: { where: { deletedAt: null }, orderBy: { enrollmentDate: 'asc' }, select: { id: true } },
    },
  });

  let sessions = 0;
  let marks = 0;
  for (const [pi, prog] of programs.entries()) {
    if (prog.enrollments.length === 0) continue;
    const start = prog.startDate ?? addDays(TODAY, -56);
    const cap = prog.status === 'completed' && prog.endDate && prog.endDate < TODAY ? prog.endDate : TODAY;
    const dates = weeklyDates(start, cap, 8);

    for (const [si, date] of dates.entries()) {
      if (prog.sessions.some((s) => sameDay(s.sessionDate, date))) continue;
      const session = await prisma.outsideProgramSession.create({
        data: { outsideProgramId: prog.id, sessionDate: date, topic: `Week ${si + 1} — ${at(TOPICS, pi + si + 3)}` },
      });
      sessions += 1;

      if (prog.status === 'active' && si === dates.length - 1) continue;
      await prisma.outsideSessionAttendance.createMany({
        data: prog.enrollments.map((e, ei) => ({
          sessionId: session.id,
          enrollmentId: e.id,
          status: statusFor(pi + 5, si, ei),
        })),
      });
      marks += prog.enrollments.length;
    }
  }
  return { sessions, marks };
}

async function main() {
  const inside = await seedInsideAttendance();
  const outside = await seedOutsideAttendance();
  console.log(
    `Inside classes: +${inside.sessions} sessions, +${inside.marks} attendance marks\n` +
      `Outside programs: +${outside.sessions} sessions, +${outside.marks} attendance marks`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
