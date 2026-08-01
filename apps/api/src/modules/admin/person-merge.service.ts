import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@jumpstart/database';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Scalars an admin may explicitly pull from the loser during a merge.
 * Consent flags are deliberately absent — they merge conservatively (below)
 * and cannot be overridden.
 */
export const MERGEABLE_PERSON_FIELDS = [
  'firstName',
  'middleName',
  'lastName',
  'preferredName',
  'suffix',
  'dateOfBirth',
  'gender',
  'race',
  'preferredLanguage',
  'primaryPhone',
  'primaryEmail',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'zip',
  'deceasedAt',
] as const;
export type MergeablePersonField = (typeof MERGEABLE_PERSON_FIELDS)[number];
export type FieldOverrides = Record<string, 'winner' | 'loser'>;

const PERSON_SELECT = {
  id: true,
  firstName: true,
  middleName: true,
  lastName: true,
  preferredName: true,
  suffix: true,
  dateOfBirth: true,
  gender: true,
  race: true,
  preferredLanguage: true,
  primaryPhone: true,
  primaryEmail: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  zip: true,
  emailOk: true,
  smsOk: true,
  smsConsentAt: true,
  mailOnly: true,
  doNotContact: true,
  emailBouncedAt: true,
  deceasedAt: true,
  createdAt: true,
  deletedAt: true,
  participantProfile: { select: { id: true, participantNumber: true, deletedAt: true } },
  volunteerProfile: { select: { id: true, deletedAt: true } },
  user: { select: { id: true, email: true, deletedAt: true } },
} satisfies Prisma.PersonSelect;

type PersonSnapshot = Prisma.PersonGetPayload<{ select: typeof PERSON_SELECT }>;

/**
 * Every personId-style FK on Person, verified against schema.prisma. The 1:1
 * relations (ParticipantProfile, VolunteerProfile, User — all @unique on
 * personId) are handled separately; polymorphic tables (Attachment, AuditLog)
 * never point at persons — attachments hang off participant profiles, case
 * notes etc., and audit history intentionally stays on the original ids.
 */
const CHILD_TABLES: {
  key: string;
  count: (db: Prisma.TransactionClient, personId: string) => Promise<number>;
  repoint: (
    db: Prisma.TransactionClient,
    fromPersonId: string,
    toPersonId: string,
  ) => Promise<{ count: number }>;
}[] = [
  {
    key: 'addresses',
    count: (db, id) => db.personAddress.count({ where: { personId: id } }),
    repoint: (db, from, to) =>
      db.personAddress.updateMany({ where: { personId: from }, data: { personId: to } }),
  },
  {
    key: 'contacts',
    count: (db, id) => db.personContact.count({ where: { personId: id } }),
    repoint: (db, from, to) =>
      db.personContact.updateMany({ where: { personId: from }, data: { personId: to } }),
  },
  {
    key: 'testimonyConsents',
    count: (db, id) => db.testimonyConsent.count({ where: { personId: id } }),
    repoint: (db, from, to) =>
      db.testimonyConsent.updateMany({ where: { personId: from }, data: { personId: to } }),
  },
  {
    key: 'backgroundChecks',
    count: (db, id) => db.backgroundCheck.count({ where: { personId: id } }),
    repoint: (db, from, to) =>
      db.backgroundCheck.updateMany({ where: { personId: from }, data: { personId: to } }),
  },
  {
    key: 'communications',
    count: (db, id) => db.communication.count({ where: { personId: id } }),
    repoint: (db, from, to) =>
      db.communication.updateMany({ where: { personId: from }, data: { personId: to } }),
  },
  {
    key: 'eventRegistrations',
    count: (db, id) => db.eventRegistration.count({ where: { personId: id } }),
    repoint: (db, from, to) =>
      db.eventRegistration.updateMany({ where: { personId: from }, data: { personId: to } }),
  },
  {
    key: 'donors',
    count: (db, id) => db.donor.count({ where: { personId: id } }),
    repoint: (db, from, to) =>
      db.donor.updateMany({ where: { personId: from }, data: { personId: to } }),
  },
  {
    key: 'volunteerApplications',
    count: (db, id) => db.volunteerApplication.count({ where: { linkedPersonId: id } }),
    repoint: (db, from, to) =>
      db.volunteerApplication.updateMany({
        where: { linkedPersonId: from },
        data: { linkedPersonId: to },
      }),
  },
];

/** null/undefined-safe comparison; Dates compare by instant. */
function sameValue(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) =>
    v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : v;
  return norm(a) === norm(b);
}

/**
 * Conservative consent union (§7.4 / TCPA):
 *  - doNotContact / mailOnly: true wins — never widen contact permissions.
 *  - emailOk: opt-out wins — false if either record opted out.
 *  - smsOk: only survives when the record granting it carries smsConsentAt
 *    (an smsOk without its consent timestamp is not proof of opt-in).
 *  - emailBouncedAt: any bounce signal is kept (deliverability, not consent).
 */
function mergeConsent(winner: PersonSnapshot, loser: PersonSnapshot) {
  const winnerSms = winner.smsOk && !!winner.smsConsentAt;
  const loserSms = loser.smsOk && !!loser.smsConsentAt;
  return {
    emailOk: winner.emailOk && loser.emailOk,
    smsOk: winnerSms || loserSms,
    smsConsentAt: winnerSms
      ? winner.smsConsentAt
      : loserSms
        ? loser.smsConsentAt
        : (winner.smsConsentAt ?? loser.smsConsentAt),
    mailOnly: winner.mailOnly || loser.mailOnly,
    doNotContact: winner.doNotContact || loser.doNotContact,
    emailBouncedAt: winner.emailBouncedAt ?? loser.emailBouncedAt,
  };
}

@Injectable()
export class AdminPersonMergeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Free-text person search for the merge pickers: name, email or phone. */
  async search(q: string) {
    const term = q.trim();
    const tokens = term.split(/\s+/).filter(Boolean);
    const digits = term.replace(/\D/g, '');

    const or: Prisma.PersonWhereInput[] = [
      { primaryEmail: { contains: term, mode: 'insensitive' } },
      { primaryPhone: { contains: term } },
    ];
    if (tokens.length >= 2) {
      const [first, last] = [tokens[0], tokens[tokens.length - 1]];
      or.push(
        {
          AND: [
            { firstName: { contains: first, mode: 'insensitive' } },
            { lastName: { contains: last, mode: 'insensitive' } },
          ],
        },
        {
          AND: [
            { firstName: { contains: last, mode: 'insensitive' } },
            { lastName: { contains: first, mode: 'insensitive' } },
          ],
        },
      );
    } else {
      or.push(
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { preferredName: { contains: term, mode: 'insensitive' } },
      );
    }
    // Phones are stored as XXX-XXX-XXXX; a fully-typed number matches exactly
    // regardless of the punctuation the admin used.
    if (digits.length === 10) {
      or.push({ primaryPhone: `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` });
    }

    const matches = await this.prisma.person.findMany({
      where: { deletedAt: null, OR: or },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        dateOfBirth: true,
        primaryEmail: true,
        primaryPhone: true,
        participantProfile: { select: { id: true, participantNumber: true, deletedAt: true } },
        volunteerProfile: { select: { id: true, deletedAt: true } },
        user: { select: { id: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 20,
    });

    return matches.map((p) => {
      const profileTypes = [
        ...(p.participantProfile && !p.participantProfile.deletedAt ? ['participant'] : []),
        ...(p.volunteerProfile && !p.volunteerProfile.deletedAt ? ['volunteer'] : []),
        ...(p.user ? ['staff'] : []),
      ];
      const facts = [
        p.dateOfBirth ? `DOB ${p.dateOfBirth.toISOString().slice(0, 10)}` : null,
        p.primaryEmail,
        p.primaryPhone,
        profileTypes.length ? profileTypes.join(', ') : 'no profiles',
      ].filter(Boolean);
      return {
        id: p.id,
        label: `${p.firstName} ${p.lastName}${p.preferredName ? ` (${p.preferredName})` : ''}`,
        sublabel: facts.join(' · '),
        profileTypes,
        participantNumber: p.participantProfile?.participantNumber ?? null,
      };
    });
  }

  async preview(winnerPersonId: string, loserPersonId: string) {
    const { winner, loser } = await this.loadPair(winnerPersonId, loserPersonId);
    const [winnerCounts, loserCounts] = await Promise.all([
      this.childCounts(this.prisma, winner.id),
      this.childCounts(this.prisma, loser.id),
    ]);

    const scalarDiffs = MERGEABLE_PERSON_FIELDS.filter(
      (field) => !sameValue(winner[field], loser[field]),
    ).map((field) => ({ field, winner: winner[field], loser: loser[field] }));

    return {
      winner,
      loser,
      childCounts: { winner: winnerCounts, loser: loserCounts },
      conflicts: this.conflicts(winner, loser),
      scalarDiffs,
      consentPreview: mergeConsent(winner, loser),
    };
  }

  async merge(
    winnerPersonId: string,
    loserPersonId: string,
    fieldOverrides: FieldOverrides | undefined,
    userId: string,
  ) {
    const overrides = fieldOverrides ?? {};
    const validFields = new Set<string>(MERGEABLE_PERSON_FIELDS);
    const invalid = Object.keys(overrides).filter((k) => !validFields.has(k));
    if (invalid.length) {
      throw new BadRequestException(`Unknown mergeable field(s): ${invalid.join(', ')}`);
    }

    const { winner, loser } = await this.loadPair(winnerPersonId, loserPersonId);

    const conflicts = this.conflicts(winner, loser);
    if (conflicts.blocked) {
      throw new ConflictException({
        message: `Cannot merge: ${conflicts.reasons.join(' ')}`,
        reasons: conflicts.reasons,
      });
    }

    const fieldsTakenFromLoser = MERGEABLE_PERSON_FIELDS.filter(
      (f) => overrides[f] === 'loser',
    );
    const consent = mergeConsent(winner, loser);

    const scalarData: Prisma.PersonUncheckedUpdateInput = {};
    for (const field of fieldsTakenFromLoser) {
      (scalarData as Record<string, unknown>)[field] = loser[field];
    }
    // Data-preserving default: a deceased marker never silently disappears.
    if (scalarData.deceasedAt === undefined && !winner.deceasedAt && loser.deceasedAt) {
      scalarData.deceasedAt = loser.deceasedAt;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const repointed: Record<string, number> = {};
      for (const table of CHILD_TABLES) {
        const { count } = await table.repoint(tx, loser.id, winner.id);
        repointed[table.key] = count;
      }

      // 1:1s move only into a vacant slot (conflicts were blocked above).
      const movedProfiles: string[] = [];
      if (loser.participantProfile && !winner.participantProfile) {
        await tx.participantProfile.update({
          where: { id: loser.participantProfile.id },
          data: { personId: winner.id, updatedById: userId },
        });
        movedProfiles.push('participantProfile');
      }
      if (loser.volunteerProfile && !winner.volunteerProfile) {
        await tx.volunteerProfile.update({
          where: { id: loser.volunteerProfile.id },
          data: { personId: winner.id, updatedById: userId },
        });
        movedProfiles.push('volunteerProfile');
      }
      if (loser.user && !winner.user) {
        await tx.user.update({
          where: { id: loser.user.id },
          data: { personId: winner.id, updatedById: userId },
        });
        movedProfiles.push('user');
      }

      await tx.person.update({
        where: { id: winner.id },
        data: { ...scalarData, ...consent, updatedById: userId },
      });
      await tx.person.update({
        where: { id: loser.id },
        data: { deletedAt: new Date(), updatedById: userId },
      });

      const updatedWinner = await tx.person.findUniqueOrThrow({
        where: { id: winner.id },
        select: PERSON_SELECT,
      });
      return { repointed, movedProfiles, updatedWinner };
    });

    // ONE audit row for the whole merge; the loser's tombstone lives in the
    // metadata (mergedIntoPersonId) since Person has no marker column.
    await this.audit.log({
      userId,
      action: 'merge',
      entityType: 'person',
      entityId: winner.id,
      oldValues: { winner, loser },
      newValues: { winner: result.updatedWinner },
      metadata: {
        loserPersonId: loser.id,
        mergedIntoPersonId: winner.id,
        repointCounts: result.repointed,
        movedProfiles: result.movedProfiles,
        fieldOverrides: overrides,
      },
    });

    const w = result.updatedWinner;
    return {
      winnerPersonId: winner.id,
      loserPersonId: loser.id,
      repointed: result.repointed,
      movedProfiles: result.movedProfiles,
      fieldsTakenFromLoser,
      consent,
      winner: {
        id: w.id,
        firstName: w.firstName,
        lastName: w.lastName,
        participantProfileId:
          w.participantProfile && !w.participantProfile.deletedAt
            ? w.participantProfile.id
            : null,
        participantNumber:
          w.participantProfile && !w.participantProfile.deletedAt
            ? w.participantProfile.participantNumber
            : null,
      },
    };
  }

  private async loadPair(winnerPersonId: string, loserPersonId: string) {
    if (winnerPersonId === loserPersonId) {
      throw new BadRequestException('Pick two different people to merge');
    }
    const [winner, loser] = await Promise.all([
      this.prisma.person.findUnique({ where: { id: winnerPersonId }, select: PERSON_SELECT }),
      this.prisma.person.findUnique({ where: { id: loserPersonId }, select: PERSON_SELECT }),
    ]);
    if (!winner || winner.deletedAt) {
      throw new NotFoundException('Winner person not found (or already deleted/merged)');
    }
    if (!loser || loser.deletedAt) {
      throw new NotFoundException('Loser person not found (or already deleted/merged)');
    }
    return { winner, loser };
  }

  /**
   * v1 blocking rules. Profile/user rows count even when soft-deleted:
   * personId is @unique on all three tables, so a second row physically
   * cannot be re-pointed to the winner.
   */
  private conflicts(winner: PersonSnapshot, loser: PersonSnapshot) {
    const bothHaveUsers = !!winner.user && !!loser.user;
    const participant = !!winner.participantProfile && !!loser.participantProfile;
    const volunteer = !!winner.volunteerProfile && !!loser.volunteerProfile;
    const reasons: string[] = [];
    if (bothHaveUsers) {
      reasons.push(
        'Both people are linked to login accounts; merging two staff-linked records is not supported in v1.',
      );
    }
    if (participant) {
      reasons.push(
        'Both people have participant profiles (including soft-deleted ones); participant-profile merge is not supported in v1.',
      );
    }
    if (volunteer) {
      reasons.push(
        'Both people have volunteer profiles (including soft-deleted ones); volunteer-profile merge is not supported in v1.',
      );
    }
    return {
      bothHaveUsers,
      profileConflicts: { participant, volunteer },
      blocked: reasons.length > 0,
      reasons,
    };
  }

  private async childCounts(db: Prisma.TransactionClient, personId: string) {
    const counts: Record<string, number> = {};
    await Promise.all(
      CHILD_TABLES.map(async (t) => {
        counts[t.key] = await t.count(db, personId);
      }),
    );
    return counts;
  }
}
